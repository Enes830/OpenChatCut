#!/usr/bin/env python3
"""
render_pipeline.py

Takes a storyboard CSV file, maps its media & texts into OpenChatCut's
motion graphics engine (Arabic News / Videograph templates), updates the
SQLite project store, and headlessly renders the final vertical (1080x1920) MP4.

Usage:
  python3 csv-video-pipeline/render_pipeline.py --csv csv-video-pipeline/storyboard_1_energy_summit.csv
  python3 csv-video-pipeline/render_pipeline.py --csv csv-video-pipeline/storyboard_2_world_isolation.csv --render
  python3 csv-video-pipeline/render_pipeline.py --csv csv-video-pipeline/storyboard_3_economic_markets.csv --render
"""

import os
import sys
import json
import uuid
import shutil
import sqlite3
import argparse
import subprocess
from pathlib import Path

# Resolve project repository root (parent of this script if placed in csv-video-pipeline/)
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent if (SCRIPT_DIR.parent / 'package.json').exists() else SCRIPT_DIR

TEMPLATE_MAP = {
    'blue-boxes': 'arabic-blue-news-boxes',
    'red-boxes': 'arabic-headline-boxes',
    'headline': 'rssd-text-headline-template',
    'quote': 'rssd-quote-card-template',
    'badge': 'rssd-raw-badge-template',
    'quote-single': 'rasd-quote-single',
}

def locate_data_dir(custom_dir=None):
    if custom_dir and os.path.exists(custom_dir):
        return custom_dir, None
    home = Path.home()
    dev_profiles_root = home / '.openchatcut' / 'dev-profiles'
    if dev_profiles_root.exists():
        for entry in dev_profiles_root.iterdir():
            if entry.is_dir() and (entry / 'project-store-v1.sqlite3').exists():
                return str(entry), str(entry / 'media' / 'uploads')
    default_dir = home / '.openchatcut'
    return str(default_dir), None

def load_templates():
    tpl_path = PROJECT_ROOT / 'assets' / 'templates' / 'openchatcut-templates.json'
    if not tpl_path.exists():
        raise FileNotFoundError(f"Template catalog not found at {tpl_path}")
    with open(tpl_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_template(templates, style_key):
    tpl_id = TEMPLATE_MAP.get(style_key.lower().strip(), style_key)
    for t in templates:
        if t['id'] == tpl_id:
            return t
    for t in templates:
        if t['id'] == 'arabic-blue-news-boxes':
            return t
    raise ValueError(f"Template {style_key} not found")

def parse_csv(csv_path):
    import csv
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        return list(reader)

def main():
    parser = argparse.ArgumentParser(description="Render OpenChatCut Video from Storyboard CSV")
    parser.add_argument('--csv', required=True, help='Path to storyboard CSV file')
    parser.add_argument('--project-id', default=None, help='Project ID (default: random 8-char)')
    parser.add_argument('--project-name', default=None, help='Project Name')
    parser.add_argument('--accent-color', default='#0f83f3', help='Accent Color (default: #0f83f3)')
    parser.add_argument('--font-family', default='GhroobArabic', help='Arabic Font Family')
    parser.add_argument('--render', action='store_true', help='Execute Remotion headless render to MP4')
    parser.add_argument('--out', default=None, help='Output MP4 destination (default: csv-video-pipeline/outputs/<csv_name>.mp4)')
    parser.add_argument('--data-dir', default=None, help='Custom OpenChatCut data directory')
    args = parser.parse_args()

    csv_path = Path(args.csv).resolve()
    if not csv_path.exists():
        print(f"❌ CSV file not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    project_id = args.project_id or uuid.uuid4().hex[:8]
    project_name = args.project_name or f"فيديو {csv_path.stem}"

    # Default output directory: csv-video-pipeline/outputs/
    output_dir = SCRIPT_DIR / 'outputs'
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.out).resolve() if args.out else (output_dir / f"{csv_path.stem}.mp4")

    data_dir, profile_media_dir = locate_data_dir(args.data_dir)
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    db_path = os.path.join(data_dir, 'project-store-v1.sqlite3')

    # Ensure table and migration receipt exist
    init_conn = sqlite3.connect(db_path)
    init_conn.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);")
    init_conn.execute("""
        CREATE TABLE IF NOT EXISTS storage_migration_state (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            state TEXT NOT NULL CHECK (state = 'complete'),
            receipt TEXT NOT NULL
        );
    """)
    receipt_data = json.dumps({"phase": 2, "count": 0, "keys": {}, "sources": {}})
    init_conn.execute("""
        INSERT OR REPLACE INTO storage_migration_state (singleton, state, receipt)
        VALUES (1, 'complete', ?);
    """, (receipt_data,))
    init_conn.commit()
    init_conn.close()

    receipt_file = Path(f"{db_path}.receipt.json")
    if not receipt_file.exists():
        with open(receipt_file, 'w', encoding='utf-8') as rf:
            rf.write(receipt_data)

    workspace_uploads = PROJECT_ROOT / 'public' / 'media' / 'uploads'
    workspace_uploads.mkdir(parents=True, exist_ok=True)
    if profile_media_dir:
        Path(profile_media_dir).mkdir(parents=True, exist_ok=True)

    print(f"📂 Using Data Dir: {data_dir}")
    print(f"🗄️ Database: {db_path}")

    templates = load_templates()
    rows = parse_csv(csv_path)
    if not rows:
        print(f"❌ No rows found in {csv_path}", file=sys.stderr)
        sys.exit(1)
    print(f"📋 Parsed {len(rows)} scenes from {csv_path.name}")

    fps = 30
    width = 1080
    height = 1920

    assets = []
    items = []
    current_frame = 0

    for idx, row in enumerate(rows):
        media_val = row.get('media') or row.get('نوع المادة') or row.get('لينك المادة') or row.get('image') or f"scene_{idx+1}.jpg"
        media_file = Path(media_val.strip()).name

        # Search candidates
        candidates = [
            PROJECT_ROOT / media_val.strip(),
            SCRIPT_DIR / 'media' / media_file,
            workspace_uploads / media_file,
            Path(profile_media_dir) / media_file if profile_media_dir else None,
            PROJECT_ROOT / 'backups' / 'backup_20261009_111607' / 'uploads' / 'uploads' / media_file
        ]

        for cand in candidates:
            if cand and cand.exists():
                target_ws = workspace_uploads / media_file
                if cand.resolve() != target_ws.resolve():
                    shutil.copyfile(cand, target_ws)
                if profile_media_dir:
                    target_pm = Path(profile_media_dir) / media_file
                    if cand.resolve() != target_pm.resolve():
                        shutil.copyfile(cand, target_pm)
                break

        asset_id = f"asset_scene_{idx+1}_{uuid.uuid4().hex[:6]}"
        assets.append({
            "id": asset_id,
            "name": media_file,
            "kind": "image",
            "src": f"/media/uploads/{media_file}",
            "durationInFrames": 300,
            "width": 1024,
            "height": 1024
        })

        dur_raw = row.get('duration') or row.get('توقيت الاقتطاع') or '4.0'
        try:
            dur_sec = float(dur_raw)
        except ValueError:
            dur_sec = 4.0
        dur_frames = int(round(dur_sec * fps))

        raw_text = row.get('text') or row.get('النص') or row.get('line1') or ''
        style = row.get('style') or 'blue-boxes'
        tmpl = get_template(templates, style)

        lines = [x.strip() for x in raw_text.replace('\n', '|').split('|') if x.strip()]
        line1 = lines[0] if len(lines) > 0 else raw_text
        line2 = lines[1] if len(lines) > 1 else ''
        line3 = lines[2] if len(lines) > 2 else ''

        # Background Media Item (Track V2 - bottom layer)
        items.append({
            "id": f"item_bg_{idx+1}",
            "track": "track_v2",
            "name": media_file,
            "kind": "image",
            "startFrame": current_frame,
            "durationInFrames": dur_frames,
            "src": f"/media/uploads/{media_file}",
            "sourceAssetId": asset_id,
            "width": 1024,
            "height": 1024,
            "transform": {"scale": 1.88, "scaleX": 1.88, "scaleY": 1.88}
        })

        # Motion Graphic Overlay (Track V1 - top layer)
        mg_props = dict(tmpl.get('props', {}))
        mg_props['fontFamily'] = args.font_family
        mg_props['enableExitAnimation'] = True
        mg_props['exitDelayFrames'] = max(10, dur_frames - 25)

        if tmpl['id'] in ('arabic-blue-news-boxes', 'arabic-headline-boxes'):
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2
            mg_props['line3Text'] = line3
            mg_props['line1BgColor'] = args.accent_color
            mg_props['yOffsetPercent'] = 60
        elif tmpl['id'] == 'rssd-quote-card-template':
            mg_props['quoteText'] = raw_text
            mg_props['speakerName'] = row.get('speaker', 'رصد')
            mg_props['speakerTitle'] = row.get('title', '')
            mg_props['accentColor'] = args.accent_color
        elif tmpl['id'] == 'rssd-text-headline-template':
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2 or line1
            mg_props['lineCount'] = 2 if line2 else 1
            mg_props['accentColor'] = args.accent_color
            mg_props['bottomOffset'] = 252
        elif tmpl['id'] == 'rssd-raw-badge-template':
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2 or 'رصد'
            mg_props['accentColor'] = args.accent_color

        items.append({
            "id": f"item_mg_{idx+1}",
            "track": "track_v1",
            "name": tmpl['name'],
            "kind": "motion-graphic",
            "templateId": tmpl['id'],
            "code": tmpl['code'],
            "startFrame": current_frame,
            "durationInFrames": dur_frames,
            "width": width,
            "height": height,
            "transform": {"scale": 1, "scaleX": 1, "scaleY": 1},
            "props": mg_props
        })

        current_frame += dur_frames

    project_doc = {
        "version": 3,
        "assets": assets,
        "mediaFolders": [],
        "activeTimelineId": "tl_main",
        "timelines": [
            {
                "id": "tl_main",
                "name": "الرئيسي",
                "order": 0,
                "fps": fps,
                "width": width,
                "height": height,
                "trackOrder": ["track_v1", "track_v2"],
                "tracks": {
                    "track_v1": {"kind": "video"},
                    "track_v2": {"kind": "video"}
                },
                "items": items
            }
        ]
    }

    # Save to SQLite
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", (f"project:{project_id}", json.dumps(project_doc)))

    row = cur.execute("SELECT v FROM kv WHERE k = ?", ("projects",)).fetchone()
    project_list = json.loads(row[0]) if (row and row[0]) else []
    project_list = [p for p in project_list if p.get('id') != project_id]
    project_list.insert(0, {
        "id": project_id,
        "name": project_name,
        "updatedAt": int(csv_path.stat().st_mtime * 1000)
    })
    cur.execute("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", ("projects", json.dumps(project_list)))
    conn.commit()
    conn.close()

    print("\n✨ Project Created Successfully!")
    print(f"🆔 Project ID: {project_id}")
    print(f"⏱️ Total Duration: {current_frame / fps:.1f}s ({current_frame} frames)")
    print(f"🔗 Web Preview: http://localhost:5199/#/editor/{project_id}")

    if args.render:
        print(f"\n🚀 Starting Headless Render -> {out_path} ...")
        occ_cli = PROJECT_ROOT / 'cli' / 'occ.mjs'
        cmd = [
            'node', str(occ_cli),
            '--data-dir', data_dir,
            'render', project_id,
            '--out', str(out_path),
            '--resolution', '1080p'
        ]
        subprocess.run(cmd, check=True)
        print(f"\n🎉 Render Completed! Saved to: {out_path}")

if __name__ == '__main__':
    main()

