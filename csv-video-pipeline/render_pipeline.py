#!/usr/bin/env python3
"""
render_pipeline.py

Takes a storyboard CSV file OR a Google Docs URL, maps its media, headlines,
source credit (@anas_habib), and Arabic translation subtitles into OpenChatCut's
motion graphics engine, updates the SQLite project store, and headlessly renders
the final vertical (1080x1920) MP4.

Usage:
  python3 csv-video-pipeline/render_pipeline.py --doc "https://docs.google.com/document/d/1G9QF-PDb6aWvwxu9BmYxj_AqaTdDwa1Ydpe0KO2eqd0/edit" --render
  python3 csv-video-pipeline/render_pipeline.py --csv csv-video-pipeline/storyboard_1_energy_summit.csv --render
"""

import os
import re
import sys
import csv
import json
import uuid
import time
import shutil
import sqlite3
import argparse
import subprocess
import urllib.request
from pathlib import Path
from html.parser import HTMLParser

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent if (SCRIPT_DIR.parent / 'package.json').exists() else SCRIPT_DIR

TEMPLATE_MAP = {
    'blue-boxes': 'arabic-blue-news-boxes',
    'مربعات زرقاء': 'arabic-blue-news-boxes',
    'red-boxes': 'arabic-headline-boxes',
    'headline': 'rssd-text-headline-template',
    'quote': 'rssd-quote-card-template',
    'اقتباس': 'rssd-quote-card-template',
    'badge': 'rssd-raw-badge-template',
    'quote-single': 'rasd-quote-single',
    'breaking': 'rssd-location-headline-template',
    'location-headline': 'rssd-location-headline-template',
    'rssd-location-headline': 'rssd-location-headline-template',
    'location': 'rssd-location-headline-template',
    'أزرق': 'rssd-location-headline-template',
    'أحمر': 'rssd-location-headline-template',
    'أخضر': 'rssd-location-headline-template',
    'عاجل': 'rssd-location-headline-template',
}


class GoogleDocTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_td = False
        self.rows = []
        self.current_row = []
        self.current_cell = []

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.current_row = []
        elif tag in ('td', 'th'):
            self.in_td = True
            self.current_cell = []
        elif tag in ('p', 'br') and self.in_td and self.current_cell:
            if self.current_cell[-1] != '\n':
                self.current_cell.append('\n')

    def handle_endtag(self, tag):
        if tag in ('td', 'th'):
            self.in_td = False
            cell_text = ''.join(self.current_cell).replace('\xa0', ' ').strip()
            self.current_row.append(cell_text)
        elif tag == 'tr':
            if any(c.strip() for c in self.current_row):
                self.rows.append(self.current_row)

    def handle_data(self, data):
        if self.in_td:
            self.current_cell.append(data)


def parse_google_sheet(sheet_url: str):
    match = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', sheet_url)
    if not match:
        raise ValueError(f"Invalid Google Sheet URL: {sheet_url}")
    sheet_id = match.group(1)
    gid_match = re.search(r'[#&?]gid=([0-9]+)', sheet_url)
    gid_param = f"&gid={gid_match.group(1)}" if gid_match else ""
    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv{gid_param}"
    print(f"🌐 Fetching Google Sheet CSV from: {export_url} ...")
    req = urllib.request.Request(export_url, headers={'User-Agent': 'Mozilla/5.0'})
    csv_bytes = urllib.request.urlopen(req, timeout=20).read()
    import io
    reader = csv.DictReader(io.StringIO(csv_bytes.decode('utf-8-sig', errors='replace')))
    records = []
    for row in reader:
        # Strip all whitespace from keys and values
        clean_row = {re.sub(r'\s+', ' ', k).strip(): v.strip() for k, v in row.items() if k}
        if any(clean_row.values()):
            records.append(clean_row)
    return records


def parse_google_doc(doc_url: str):
    match = re.search(r'/document/d/([a-zA-Z0-9_-]+)', doc_url)
    if not match:
        raise ValueError(f"Invalid Google Docs URL: {doc_url}")
    doc_id = match.group(1)
    export_url = f"https://docs.google.com/document/d/{doc_id}/export?format=html"
    print(f"🌐 Fetching Google Doc table from: {export_url} ...")
    req = urllib.request.Request(export_url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8')

    parser = GoogleDocTableParser()
    parser.feed(html)
    if len(parser.rows) < 2:
        raise ValueError("Google Doc does not contain a valid table with header and data rows.")

    headers = [re.sub(r'\s+', ' ', h).strip() for h in parser.rows[0]]
    records = []
    for raw_row in parser.rows[1:]:
        row_dict = {}
        for idx, h in enumerate(headers):
            val = raw_row[idx].strip() if idx < len(raw_row) else ''
            row_dict[h] = val
        if any(row_dict.values()):
            records.append(row_dict)
    return records


def parse_csv(csv_path):
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        return list(reader)


def is_full_video_indicator(val: str) -> bool:
    if not val:
        return True
    c = str(val).strip().lower()
    return c in {'-', '—', '–', 'كامل', 'الكامل', 'الفيديو كامل', 'كامل الفيديو', 'بدون اقتطاع', 'بدون', 'full', 'all'}


def parse_duration_and_start(dur_raw: str, default_dur: float = 8.0) -> tuple[float, float]:
    """Returns (duration_seconds, start_seconds)"""
    if not dur_raw or is_full_video_indicator(dur_raw):
        return default_dur, 0.0
    dur_str = str(dur_raw).strip()
    # Support MM:SS - MM:SS or SS - SS range format
    range_match = re.match(r'(\d+):(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+):(\d+(?:\.\d+)?)', dur_str)
    if range_match:
        m1, s1, m2, s2 = map(float, range_match.groups())
        start_sec = m1 * 60 + s1
        end_sec = m2 * 60 + s2
        diff = end_sec - start_sec
        return (diff if diff > 0 else default_dur), start_sec
    sec_range = re.match(r'(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)', dur_str)
    if sec_range:
        s1, s2 = map(float, sec_range.groups())
        diff = s2 - s1
        return (diff if diff > 0 else default_dur), s1
    try:
        return float(dur_str), 0.0
    except ValueError:
        return default_dur, 0.0


def parse_duration(dur_raw: str, default_dur: float = 8.0) -> float:
    dur, _ = parse_duration_and_start(dur_raw, default_dur)
    return dur


def is_youtube_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    return bool(re.search(r'(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)', url))


def extract_youtube_id(url: str) -> str:
    m = re.search(r'(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else "yt_video"


def download_youtube_video(url: str, dest_path: Path):
    yt_bin = shutil.which('yt-dlp') or os.path.expanduser('~/.local/bin/yt-dlp')
    if not yt_bin or (not os.path.exists(yt_bin) and not shutil.which('yt-dlp')):
        raise RuntimeError("yt-dlp is not installed. Please install yt-dlp first.")
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_template = str(dest_path.with_suffix('')) + ".%(ext)s"
    cmd = [
        yt_bin,
        '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--no-warnings',
        '-o', str(dest_path),
        url
    ]
    print(f"🎬 Downloading YouTube video: {url} -> {dest_path.name} ...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print(f"⚠️ Primary format failed: {res.stderr.strip()[:100]}... Trying fallback...")
        cmd_fallback = [
            yt_bin,
            '-f', 'best[ext=mp4]/best',
            '--recode-video', 'mp4',
            '--no-playlist',
            '-o', str(dest_path),
            url
        ]
        subprocess.run(cmd_fallback, check=True)
    print(f"✅ Downloaded YouTube video successfully: {dest_path.name}")


def download_social_media_video(url: str, dest_path: Path):
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    rapid_key = os.environ.get('RAPIDAPI_KEY', 'a8ed900b3cmsh8a96db2c3f934ffp1d6eaejsn11ea8098850d')
    # 1. Try RapidAPI Auto Download All In One
    try:
        req = urllib.request.Request(
            'https://auto-download-all-in-one.p.rapidapi.com/v1/social/autolink',
            headers={
                'Content-Type': 'application/json',
                'x-rapidapi-host': 'auto-download-all-in-one.p.rapidapi.com',
                'x-rapidapi-key': rapid_key
            },
            data=json.dumps({'url': url}).encode('utf-8')
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            rdata = json.loads(resp.read().decode('utf-8'))
            medias = rdata.get('medias', [])
            v_url = None
            for m in medias:
                if m.get('type') == 'video':
                    v_url = m.get('url')
                    if 'no_watermark' in m.get('quality', ''):
                        break
            if v_url:
                dl_req = urllib.request.Request(v_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(dl_req, timeout=40) as dresp, open(dest_path, 'wb') as out_f:
                    out_f.write(dresp.read())
                if dest_path.exists() and dest_path.stat().st_size > 1000:
                    print(f"✅ Downloaded social media via RapidAPI: {dest_path.name}")
                    return
    except Exception as e:
        print(f"⚠️ RapidAPI resolution notice ({e}), trying yt-dlp fallback...")

    # 2. Fallback to yt-dlp
    yt_bin = shutil.which('yt-dlp') or os.path.expanduser('~/.local/bin/yt-dlp')
    if yt_bin:
        cmd = [yt_bin, '-f', 'best[ext=mp4]/best', '--no-playlist', '-o', str(dest_path), url]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if dest_path.exists() and dest_path.stat().st_size > 1000:
            print(f"✅ Downloaded social media via yt-dlp: {dest_path.name}")
            return
    print(f"⚠️ Could not download social video: {url}")


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
        if t['id'] == 'rssd-location-headline-template':
            return t
    raise ValueError(f"Template {style_key} not found")


def main():
    parser = argparse.ArgumentParser(description="Render OpenChatCut Video from Storyboard CSV or Google Doc")
    parser.add_argument('--csv', default=None, help='Path to storyboard CSV file (or Google Docs URL)')
    parser.add_argument('--doc', default=None, help='Google Docs URL containing the storyboard table')
    parser.add_argument('--project-id', default=None, help='Project ID (default: random 8-char)')
    parser.add_argument('--project-name', default=None, help='Project Name')
    parser.add_argument('--accent-color', default='#1283F9', help='Accent Color (default: #1283F9)')
    parser.add_argument('--font-family', default='GhroobArabic', help='Arabic Font Family')
    parser.add_argument('--default-media', default='news_footage.mp4', help='Fallback media if cell is empty')
    parser.add_argument('--default-source', default='', help='Fallback source handle if كتابة المصدر is selected but empty')
    parser.add_argument('--render', action='store_true', help='Execute Remotion headless render to MP4')
    parser.add_argument('--out', default=None, help='Output MP4 destination')
    parser.add_argument('--data-dir', default=None, help='Custom OpenChatCut data directory')
    args = parser.parse_args()

    source_input = args.doc or args.csv
    if not source_input:
        print("❌ Please provide either --doc <google_doc_url> or --csv <csv_path>", file=sys.stderr)
        sys.exit(1)

    is_url = source_input.startswith('http://') or source_input.startswith('https://')
    if is_url:
        if 'spreadsheets/d/' in source_input:
            rows = parse_google_sheet(source_input)
            stem_name = f"gsheet_{uuid.uuid4().hex[:6]}"
            input_label = "Google Sheet"
        elif 'document/d/' in source_input:
            rows = parse_google_doc(source_input)
            stem_name = f"gdoc_{uuid.uuid4().hex[:6]}"
            input_label = "Google Doc"
        else:
            req = urllib.request.Request(source_input, headers={'User-Agent': 'Mozilla/5.0'})
            csv_bytes = urllib.request.urlopen(req, timeout=20).read()
            import io
            rows = list(csv.DictReader(io.StringIO(csv_bytes.decode('utf-8-sig', errors='replace'))))
            stem_name = f"csv_url_{uuid.uuid4().hex[:6]}"
            input_label = "CSV URL"
    else:
        csv_path = Path(source_input).resolve()
        if not csv_path.exists():
            print(f"❌ CSV file not found: {csv_path}", file=sys.stderr)
            sys.exit(1)
        rows = parse_csv(csv_path)
        stem_name = csv_path.stem
        input_label = stem_name

    if not rows:
        print("❌ No rows found in input", file=sys.stderr)
        sys.exit(1)

    project_id = args.project_id or uuid.uuid4().hex[:8]
    project_name = args.project_name or f"فيديو {stem_name}"

    output_dir = SCRIPT_DIR / 'outputs'
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.out).resolve() if args.out else (output_dir / f"{stem_name}.mp4")

    data_dir, profile_media_dir = locate_data_dir(args.data_dir)
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    db_path = os.path.join(data_dir, 'project-store-v1.sqlite3')

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
    print(f"📋 Parsed {len(rows)} scenes from {input_label}")

    templates = load_templates()
    fps = 30
    width = 1080
    height = 1920

    assets = []
    items = []
    current_frame = 0

    for idx, row in enumerate(rows):
        media_val = (
            row.get('media')
            or row.get('لينك المادة')
            or row.get('نوع المادة')
            or row.get('image')
            or args.default_media
        ).strip()
        if not media_val:
            media_val = args.default_media

        found = False
        is_yt = is_youtube_url(media_val)
        is_ig = any(k in media_val.lower() for k in ['instagram.com/reels/', 'instagram.com/p/', 'instagram.com/reel/'])
        is_tt = any(k in media_val.lower() for k in ['tiktok.com/', 'tiktokv.com/'])

        if is_yt:
            yt_id = extract_youtube_id(media_val)
            media_file = f"yt_{yt_id}.mp4"
            dest_target = workspace_uploads / media_file
            if not dest_target.exists() or dest_target.stat().st_size < 1000:
                try:
                    download_youtube_video(media_val, dest_target)
                except Exception as e:
                    print(f"⚠️ Failed to download YouTube video {media_val}: {e}")
            if dest_target.exists() and dest_target.stat().st_size > 1000:
                found = True
        elif is_ig:
            m_ig = re.search(r'instagram\.com\/(?:reels?|p)\/([a-zA-Z0-9_-]+)', media_val)
            ig_id = m_ig.group(1) if m_ig else f"ig_{idx+1}"
            media_file = f"instagram_{ig_id}.mp4"
            dest_target = workspace_uploads / media_file
            if not dest_target.exists() or dest_target.stat().st_size < 1000:
                download_social_media_video(media_val, dest_target)
            if dest_target.exists() and dest_target.stat().st_size > 1000:
                found = True
        elif is_tt:
            m_tt = re.search(r'(?:video\/|v\/|watch\/)?([0-9]{15,22})', media_val)
            tt_id = m_tt.group(1) if m_tt else f"tiktok_{idx+1}"
            media_file = f"tiktok_{tt_id}.mp4"
            dest_target = workspace_uploads / media_file
            if not dest_target.exists() or dest_target.stat().st_size < 1000:
                download_social_media_video(media_val, dest_target)
            if dest_target.exists() and dest_target.stat().st_size > 1000:
                found = True
        else:
            media_file = Path(media_val.split('?')[0]).name

            candidates = [
                PROJECT_ROOT / media_val,
                SCRIPT_DIR / 'media' / media_file,
                workspace_uploads / media_file,
                Path(profile_media_dir) / media_file if profile_media_dir else None,
            ]

            for cand in candidates:
                if cand and cand.exists() and cand.is_file():
                    found = True
                    targets = [
                        workspace_uploads / media_file,
                        data_uploads / media_file,
                        (Path(profile_media_dir) / media_file) if profile_media_dir else None,
                    ]
                    for target in targets:
                        if target and cand.resolve() != target.resolve():
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copyfile(cand, target)
                    break

            if not found:
                vps_url = (
                    media_val
                    if media_val.startswith(('http://', 'https://'))
                    else f"https://editor.kashida.io/media/uploads/{media_file}"
                )
                print(f"🌐 Downloading media {media_file} from: {vps_url}...")
                try:
                    temp_dl = workspace_uploads / media_file
                    urllib.request.urlretrieve(vps_url, temp_dl)
                    data_target = data_uploads / media_file
                    if temp_dl.resolve() != data_target.resolve():
                        shutil.copyfile(temp_dl, data_target)
                    print(f"✅ Downloaded {media_file}")
                except Exception as e:
                    print(f"⚠️ Failed to download {media_file}: {e}")

        # Ensure synced across data directories
        src_path = workspace_uploads / media_file
        if src_path.exists():
            for sync_dest in [data_uploads / media_file, (Path(profile_media_dir) / media_file) if profile_media_dir else None]:
                if sync_dest and src_path.resolve() != sync_dest.resolve():
                    sync_dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(src_path, sync_dest)

        is_video = media_file.lower().endswith(('.mp4', '.mov', '.webm', '.mkv'))
        media_kind = "video" if is_video else "image"

        dur_raw = row.get('duration') or row.get('توقيت الاقتطاع') or ''
        has_explicit_trim = bool(dur_raw.strip() and not is_full_video_indicator(dur_raw))
        dur_sec, start_sec = parse_duration_and_start(dur_raw, default_dur=8.0 if is_url else 4.0)
        dur_frames = int(round(dur_sec * fps))
        src_in_frame = int(round(start_sec * fps))

        notes_val = (row.get('notes') or row.get('ملاحظات ومؤثرات') or '').strip()
        mute_audio = 'بدون صوت' in notes_val or row.get('mute') == 'true'

        # Auto-detect real dimensions and full duration with ffprobe
        media_w = 1080 if is_video else 1024
        media_h = 1920 if is_video else 1024
        is_landscape = False
        video_dur_sec = None
        if src_path.exists() and src_path.stat().st_size > 1000 and is_video:
            try:
                probe_cmd = [
                    'ffprobe', '-v', 'error',
                    '-select_streams', 'v:0',
                    '-show_entries', 'stream=width,height,duration:format=duration',
                    '-of', 'json',
                    str(src_path)
                ]
                p_res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if p_res.returncode == 0 and p_res.stdout.strip():
                    p_info = json.loads(p_res.stdout.strip())
                    streams = p_info.get('streams', [])
                    if streams:
                        s0 = streams[0]
                        pw = int(s0.get('width', 0) or 0)
                        ph = int(s0.get('height', 0) or 0)
                        if pw > 0 and ph > 0:
                            media_w, media_h = pw, ph
                            if media_w > media_h:
                                is_landscape = True
                        if s0.get('duration'):
                            try:
                                vd = float(s0['duration'])
                                if vd > 0:
                                    video_dur_sec = vd
                            except Exception:
                                pass
                    if not video_dur_sec and p_info.get('format', {}).get('duration'):
                        try:
                            vd = float(p_info['format']['duration'])
                            if vd > 0:
                                video_dur_sec = vd
                        except Exception:
                            pass
            except Exception:
                pass

        asset_dur_frames = max(1, int(round(video_dur_sec * fps))) if (is_video and video_dur_sec and video_dur_sec > 0) else (dur_frames if is_video else 300)

        # If 'توقيت الاقتطاع' was empty, take full video duration
        if is_video and not has_explicit_trim and video_dur_sec and video_dur_sec > 0:
            dur_frames = asset_dur_frames
            src_in_frame = 0

        asset_id = f"asset_scene_{idx+1}_{uuid.uuid4().hex[:6]}"
        assets.append({
            "id": asset_id,
            "name": media_file,
            "kind": media_kind,
            "src": f"/media/uploads/{media_file}",
            "durationInFrames": asset_dur_frames,
            "width": media_w,
            "height": media_h,
        })

        # Track V1: Background Video/Image
        bg_item = {
            "id": f"item_bg_{idx+1}",
            "track": "V1",
            "name": media_file,
            "kind": media_kind,
            "startFrame": current_frame,
            "durationInFrames": dur_frames,
            "srcInFrame": src_in_frame,
            "sourceStartFrame": src_in_frame,
            "src": f"/media/uploads/{media_file}",
            "sourceAssetId": asset_id,
            "width": media_w,
            "height": media_h,
            "transform": {
                "scale": 1 if is_video else 1.88,
                "scaleX": 1 if is_video else 1.88,
                "scaleY": 1 if is_video else 1.88,
            },
        }
        if is_landscape:
            bg_item["backgroundFill"] = True
            bg_item["backgroundFillStrength"] = 65

        if mute_audio:
            bg_item["muted"] = True
            bg_item["volume"] = 0
        items.append(bg_item)

        # Determine Style & Texts from CSV or Google Doc columns
        spoken_text = re.sub(r'\s*\n\s*', ' ', (row.get('النص') or row.get('text') or '').strip())
        cover_text = (row.get('نص الغلاف') or row.get('cover_text') or '').strip()
        style = (row.get('style') or row.get('نوع الغلاف') or 'breaking').strip()
        tmpl = get_template(templates, style)

        # Headline text: prefer نص الغلاف if provided, else use النص
        headline_raw = cover_text if cover_text else spoken_text
        lines = [x.strip() for x in headline_raw.replace('\n', '|').split('|') if x.strip()]
        line1 = lines[0] if len(lines) > 0 else headline_raw
        line2 = lines[1] if len(lines) > 1 else ''
        line3 = lines[2] if len(lines) > 2 else ''

        # If a single long sentence was put in headline without '|', split it balanced into 2 lines
        if not line2 and len(line1) > 18 and ' ' in line1:
            words = line1.split()
            mid = len(words) // 2
            line1 = ' '.join(words[:mid])
            line2 = ' '.join(words[mid:])

        # Source badge (كتابة المصدر)
        source_mode = (row.get('المصدر') or '').strip()
        source_text = (
            row.get('source')
            or row.get('كتابة المصدر')
            or (args.default_source if 'كتابة المصدر' in source_mode else '')
        ).strip()
        show_source = bool(source_text) and ('بدون مصدر' not in source_mode)

        # Subtitle / Arabic Translation (أضف ترجمة)
        explicit_sub = (row.get('نص المقطع') or row.get('subtitle') or row.get('translation') or row.get('الترجمة') or '').strip().replace('\n', ' | ')
        wants_translation = 'أضف ترجمة' in notes_val or 'إضافة ترجمة' in notes_val or bool(explicit_sub)
        subtitle_text = explicit_sub if explicit_sub else (spoken_text if wants_translation else '')
        show_subtitle = bool(subtitle_text)

        # Brand color theme from لون النص or نوع الغلاف
        color_val = (row.get('لون النص') or row.get('color') or '').strip()
        accent_color = args.accent_color if args.accent_color != '#1283F9' else '#004d52'
        line2_bg = 'linear-gradient(to left, #004d52, #002345)'

        if color_val:
            hexes = re.findall(r'#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b', color_val)
            if len(hexes) >= 2:
                c1 = hexes[0] if hexes[0].startswith('#') else f"#{hexes[0]}"
                c2 = hexes[1] if hexes[1].startswith('#') else f"#{hexes[1]}"
                line2_bg = f"linear-gradient(to left, {c1}, {c2})"
                accent_color = c1
            elif len(hexes) == 1:
                c = hexes[0] if hexes[0].startswith('#') else f"#{hexes[0]}"
                line2_bg = c
                accent_color = c
            elif 'أحمر' in color_val:
                line2_bg = '#f22d2d'
                accent_color = '#f22d2d'
            elif 'أخضر' in color_val:
                line2_bg = '#00b8a7'
                accent_color = '#00b8a7'
        elif 'أحمر' in style:
            accent_color = '#f22d2d'
            line2_bg = '#f22d2d'
        elif 'أخضر' in style:
            accent_color = '#00b8a7'
            line2_bg = '#00b8a7'

        mg_props = dict(tmpl.get('props', {}))
        mg_props['fontFamily'] = args.font_family
        mg_props['enableExitAnimation'] = True
        mg_dur_frames = dur_frames

        if tmpl['id'] in ('arabic-blue-news-boxes', 'arabic-headline-boxes'):
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2
            mg_props['line3Text'] = line3
            mg_props['line1BgColor'] = accent_color
            mg_props['yOffsetPercent'] = 60
            mg_props['exitDelayFrames'] = max(10, dur_frames - 25)
        elif tmpl['id'] == 'rssd-location-headline-template':
            location_val = (row.get('اللوكيشن') or row.get('location') or row.get('الموقع') or '').strip()
            if ':' in line1 and not location_val:
                parts = line1.split(':', 1)
                location_val = parts[0].strip()
                line1 = parts[1].strip()
                # Re-balance if line2 was empty after stripping location
                if not line2 and len(line1) > 20 and ' ' in line1:
                    words = line1.split()
                    mid = len(words) // 2
                    line1 = ' '.join(words[:mid])
                    line2 = ' '.join(words[mid:])

            show_location = bool(location_val) or (row.get('showLocation') is True)
            if not location_val:
                location_val = 'القاهرة'
                # Show location by default if style is breaking/location, or if explicitly provided
                show_location = ('breaking' in style.lower() or 'location' in style.lower() or 'عاجل' in style)

            # Exact pixel sizing matching 1080x1920 reference (fontSize=72, rightOffset=238 for <=18 chars)
            max_line_len = max(len(line1), len(line2))
            if max_line_len >= 25:
                dynamic_font_size = 58
                dynamic_right_offset = 90
            elif max_line_len >= 20:
                dynamic_font_size = 66
                dynamic_right_offset = 155
            else:
                dynamic_font_size = 72
                dynamic_right_offset = 238

            mg_props['showLocation'] = show_location
            mg_props['locationText'] = location_val
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2
            mg_props['showSource'] = show_source
            mg_props['sourceText'] = source_text
            mg_props['showSubtitle'] = show_subtitle
            mg_props['subtitleText'] = subtitle_text
            mg_props['showBrandLogo'] = True
            mg_props['gap'] = 0
            mg_props['showAccentBlock'] = False
            mg_props['fontSize'] = dynamic_font_size
            mg_props['boxPaddingX'] = 24
            mg_props['boxPaddingY'] = 16
            mg_props['rightOffset'] = dynamic_right_offset
            mg_props['bottomOffset'] = 647
            mg_props['line1BgColor'] = '#ffffff'
            mg_props['line1TextColor'] = '#000000'
            mg_props['line2BgColor'] = line2_bg
            mg_props['accentColor'] = accent_color
            mg_props['line2TextColor'] = '#ffffff'
            mg_props['enableEntrance'] = True
            mg_props['enableExitAnimation'] = True
            # Headline stays for 4 seconds (120 frames) then exits, while Source, Logo & Subtitle stay for full clip!
            headline_dur = min(dur_frames, 120)
            mg_props['headlineDurationFrames'] = headline_dur
            mg_props['exitStartFrame'] = max(35, headline_dur - 15)
            mg_dur_frames = dur_frames
        elif tmpl['id'] == 'rssd-quote-card-template':
            mg_props['quoteText'] = headline_raw
            mg_props['speakerName'] = row.get('speaker', 'رصد')
            mg_props['speakerTitle'] = row.get('title', '')
            mg_props['accentColor'] = accent_color
            mg_props['exitDelayFrames'] = max(10, dur_frames - 25)
        elif tmpl['id'] == 'rssd-text-headline-template':
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2 or line1
            mg_props['lineCount'] = 2 if line2 else 1
            mg_props['accentColor'] = accent_color
            mg_props['bottomOffset'] = 252
            mg_props['exitDelayFrames'] = max(10, dur_frames - 25)
        elif tmpl['id'] == 'rssd-raw-badge-template':
            mg_props['line1Text'] = line1
            mg_props['line2Text'] = line2 or 'رصد'
            mg_props['accentColor'] = accent_color
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
            "props": mg_props,
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
                    "V1": {"kind": "video"},
                },
                "items": items,
            }
        ],
    }

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", (f"project:{project_id}", json.dumps(project_doc)))

    row_p = cur.execute("SELECT v FROM kv WHERE k = ?", ("projects",)).fetchone()
    project_list = json.loads(row_p[0]) if (row_p and row_p[0]) else []
    project_list = [p for p in project_list if p.get('id') != project_id]
    project_list.insert(0, {
        "id": project_id,
        "name": project_name,
        "updatedAt": int(time.time() * 1000),
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
            '--resolution', '1080p',
        ]
        subprocess.run(cmd, check=True, cwd=str(PROJECT_ROOT))
        print(f"\n🎉 Render Completed! Saved to: {out_path}")


if __name__ == '__main__':
    main()
