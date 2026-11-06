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
    'breaking': 'rssd-location-headline-template',
    'location-headline': 'rssd-location-headline-template',
    'rssd-location-headline': 'rssd-location-headline-template',
    'location': 'rssd-location-headline-template',
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

    # If database doesn't exist yet, initialize it cleanly via occ
    if not os.path.exists(db_path):
        occ_cli = PROJECT_ROOT / 'cli' / 'occ.mjs'
        init_cmd = ['node', str(occ_cli), '--data-dir', data_dir, 'project', 'new', 'Init']
        subprocess.run(init_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    workspace_uploads = PROJECT_ROOT / 'public' / 'media' / 'uploads'
    workspace_uploads.mkdir(parents=True, exist_ok=True)
    data_uploads = Path(data_dir) / 'media' / 'uploads'
    data_uploads.mkdir(parents=True, exist_ok=True)
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

        found = False
        for cand in candidates:
            if cand and cand.exists():
                found = True
                targets = [
                    workspace_uploads / media_file,
                    data_uploads / media_file,
                    (Path(profile_media_dir) / media_file) if profile_media_dir else None
                ]
                for target in targets:
                    if target and cand.resolve() != target.resolve():
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(cand, target)
                break

        if not found:
            # Fallback: Download directly from public VPS editor media uploads if missing on the runner
            import urllib.request
            vps_url = f"https://editor.kashida.io/media/uploads/{media_file}"
            print(f"🌐 Media file {media_file} not found locally, downloading from VPS: {vps_url}...")
            try:
                temp_dl = workspace_uploads / media_file
                urllib.request.urlretrieve(vps_url, temp_dl)
                data_target = data_uploads / media_file
                if temp_dl.resolve() != data_target.resolve():
                    shutil.copyfile(temp_dl, data_target)
                print(f"✅ Successfully downloaded {media_file} from VPS!")
            except Exception as e:
                print(f"⚠️ Failed to download {media_file} from VPS: {e}")

        is_video = media_file.lower().endswith(('.mp4', '.mov', '.webm', '.mkv'))
        media_kind = "video" if is_video else "image"

        dur_raw = row.get('duration') or row.get('توقيت الاقتطاع') or '4.0'
        try:
            dur_sec = float(dur_raw)
        except ValueError:
            dur_sec = 4.0
        dur_frames = int(round(dur_sec * fps))

        asset_id = f"asset_scene_{idx+1}_{uuid.uuid4().hex[:6]}"
        assets.append({
            "id": asset_id,
            "name": media_file,
            "kind": media_kind,
            "src": f"/media/uploads/{media_file}",
            "durationInFrames": dur_frames if is_video else 300,
            "width": 1080 if is_video else 1024,
            "height": 1920 if is_video else 1024
        })

        raw_text = row.get('text') or row.get('النص') or row.get('line1') or ''
        style = row.get('style') or 'blue-boxes'
        tmpl = get_template(templates, style)

        lines = [x.strip() for x in raw_text.replace('\n', '|').split('|') if x.strip()]
        line1 = lines[0] if len(lines) > 0 else raw_text
        line2 = lines[1] if len(lines) > 1 else ''
        line3 = lines[2] if len(lines) > 2 else ''

        # Background Media Item (Track V1 - base layer)
        items.append({
            "id": f"item_bg_{idx+1}",
            "track": "V1",
            "name": media_file,
            "kind": media_kind,
            "startFrame": current_frame,
            "durationInFrames": dur_frames,
            "src": f"/media/uploads/{media_file}",
            "sourceAssetId": asset_id,
            "width": 1080 if is_video else 1024,
            "height": 1920 if is_video else 1024,
            "transform": {"scale": 1 if is_video else 1.88, "scaleX": 1 if is_video else 1.88, "scaleY": 1 if is_video else 1.88}
        })

        # Motion Graphic Overlay (Track V1 - top layer)
        mg_props = dict(tmpl.get('props', {}))
        mg_props['fontFamily'] = args.font_family
        mg_props['enableExitAnimation'] = True
        mg_dur_frames = dur_frames

        if tmpl['id'] in ('arabic-blue-news-boxes', 'arabic-headline-boxes'):
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2
            mg_props['line3Text'] = line3
            mg_props['line1BgColor'] = args.accent_color
            mg_props['yOffsetPercent'] = 60
            mg_props['exitDelayFrames'] = max(10, dur_frames - 25)
        elif tmpl['id'] == 'rssd-location-headline-template':
            # Rssd Location & Headline intro: plays only in the beginning (e.g. 4 seconds / 120 frames),
            # then exits so the background video continues playing cleanly
            location_val = row.get('location') or 'القاهرة'
            if ':' in line1 and not row.get('location'):
                parts = line1.split(':', 1)
                location_val = parts[0].strip()
                line1 = parts[1].strip()

            # Dynamic font size and layout calculation to prevent any text clipping on 1080x1920
            max_line_len = max(len(line1), len(line2))
            if max_line_len >= 26:
                dynamic_font_size = 56
                dynamic_padding_x = 30
                dynamic_right_offset = 60
            elif max_line_len >= 19:
                dynamic_font_size = 66
                dynamic_padding_x = 34
                dynamic_right_offset = 75
            elif max_line_len >= 14:
                dynamic_font_size = 76
                dynamic_padding_x = 38
                dynamic_right_offset = 95
            else:
                dynamic_font_size = 88
                dynamic_padding_x = 42
                dynamic_right_offset = 120

            mg_props['showLocation'] = True
            mg_props['locationText'] = location_val
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2 or line1
            mg_props['fontSize'] = dynamic_font_size
            mg_props['boxPaddingX'] = dynamic_padding_x
            mg_props['rightOffset'] = dynamic_right_offset
            mg_props['line1BgColor'] = '#ffffff'
            mg_props['line1TextColor'] = '#000000'
            mg_props['line2BgColor'] = args.accent_color or '#1283F9'
            mg_props['line2TextColor'] = '#ffffff'
            mg_props['enableEntrance'] = True
            mg_props['enableExitGlitch'] = True
            # Limit motion graphic duration to 4 seconds (120 frames) intro
            mg_dur_frames = min(dur_frames, 120)
            mg_props['exitStartFrame'] = max(35, mg_dur_frames - 25)
        elif tmpl['id'] == 'rssd-quote-card-template':
            mg_props['quoteText'] = raw_text
            mg_props['speakerName'] = row.get('speaker', 'رصد')
            mg_props['speakerTitle'] = row.get('title', '')
            mg_props['accentColor'] = args.accent_color
            mg_props['exitDelayFrames'] = max(10, dur_frames - 25)
        elif tmpl['id'] == 'rssd-text-headline-template':
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2 or line1
            mg_props['lineCount'] = 2 if line2 else 1
            mg_props['accentColor'] = args.accent_color
            mg_props['bottomOffset'] = 252
            mg_props['exitDelayFrames'] = max(10, dur_frames - 25)
        elif tmpl['id'] == 'rssd-raw-badge-template':
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2 or 'رصد'
            mg_props['accentColor'] = args.accent_color
            mg_props['exitDelayFrames'] = max(10, dur_frames - 25)

        items.append({
            "id": f"item_mg_{idx+1}",
            "track": "V2",
            "name": tmpl['name'],
            "kind": "motion-graphic",
            "templateId": tmpl['id'],
            "code": tmpl['code'],
            "startFrame": current_frame,
            "durationInFrames": mg_dur_frames,
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
                "trackOrder": ["V2", "V1"],
                "tracks": {
                    "V2": {"kind": "video"},
                    "V1": {"kind": "video"}
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

