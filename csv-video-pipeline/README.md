# 🎬 OpenChatCut CSV Video Production Pipeline

This directory contains the complete automated pipeline to generate vertical (1080x1920 @ 30fps) Arabic breaking news & videograph videos from CSV files using the exact motion graphic effects from project `7d883ca3`.

---

## 📁 Directory Structure

```text
csv-video-pipeline/
├── render_pipeline.py                 # Core automation script (Python)
├── storyboard_1_energy_summit.csv      # Version 1: Energy & Hydrogen Summit
├── storyboard_2_world_isolation.csv   # Version 2: Geopolitics & World Isolation (From Google Doc)
├── storyboard_3_economic_markets.csv  # Version 3: Financial Markets & Tech Growth
├── media/                             # Distinct photos for each storyboard
│   ├── energy_summit.jpg
│   ├── energy_solar.jpg
│   ├── energy_engineers.jpg
│   ├── world_isolation.jpg
│   ├── world_diplomacy.jpg
│   ├── world_future.jpg
│   ├── market_stocks.jpg
│   ├── market_revenue.jpg
│   └── market_growth.jpg
└── outputs/                           # Rendered MP4 video outputs
    ├── storyboard_1_energy_summit.mp4
    ├── storyboard_2_world_isolation.mp4
    └── storyboard_3_economic_markets.mp4
```

---

## 🚀 How to Run

### 1. Generate Project for Web Preview (No render)
```bash
python3 csv-video-pipeline/render_pipeline.py --csv csv-video-pipeline/storyboard_1_energy_summit.csv
```
This prints the instant preview link: `http://localhost:5199/#/editor/<projectId>`.

### 2. Generate and Render Headless to MP4
```bash
python3 csv-video-pipeline/render_pipeline.py --csv csv-video-pipeline/storyboard_1_energy_summit.csv --render
python3 csv-video-pipeline/render_pipeline.py --csv csv-video-pipeline/storyboard_2_world_isolation.csv --render
python3 csv-video-pipeline/render_pipeline.py --csv csv-video-pipeline/storyboard_3_economic_markets.csv --render
```
The resulting `.mp4` files are saved directly into `csv-video-pipeline/outputs/`.

---

## 🎨 Customizable Parameters

| Parameter | Default | Purpose |
| :--- | :--- | :--- |
| `--csv` | *(Required)* | Path to the storyboard CSV |
| `--accent-color` | `#0f83f3` | Headline banner accent color (Rasd blue, red, etc.) |
| `--font-family` | `GhroobArabic` | Arabic typography font |
| `--render` | `False` | Trigger Remotion headless render to MP4 |
| `--out` | `outputs/<name>.mp4` | Custom output path |

