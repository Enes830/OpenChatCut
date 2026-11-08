# AGENTS.md — Instructions & Architecture for AI Coding Agents

> **MANDATORY READING FOR ANY AI AGENT WORKING ON THIS REPOSITORY.**  
> Follow these instructions to avoid breaking production, corrupting user data, or triggering failing CI/CD builds.

---

## 1. Fast Production Deployment (The Old Way — 20 Seconds)

### ⚠️ Never Use GitHub Actions / Docker for Deployment
- **Do not** add or enable Docker GHCR build/deploy workflows in `.github/workflows/`.
- **Why Docker CI/CD was removed**:
  1. **Layer Pull Timeouts**: The Docker image is 1.5GB+. GHCR downloads over the VPS connection take 10+ minutes, causing SSH actions to timeout (`Run Command Timeout`).
  2. **Binary Permission Bugs**: Running `npm ci --ignore-scripts` inside Docker leaves `@ffprobe-installer` and `ffmpeg-static` non-executable (`chmod 644`), causing HTTP 503 `EACCES` crashes on `/api/preview-proxy`.
  3. **VPS Resource Exhaustion**: Storing and swapping multi-gigabyte Docker layers exhausts disk space on the VPS.

### ✅ The Official Deployment Method
From the `OpenChatCut` folder, run:
```bash
./scripts/deploy-production.sh
```
Or manually:
```bash
# 1. Build locally on Mac
npm run build

# 2. Package dist
COPYFILE_DISABLE=1 tar --no-xattrs -czf dist.tar.gz -C dist .

# 3. Upload and swap atomically on VPS
scp dist.tar.gz deploy@185.170.112.42:/home/deploy/openchatcut/dist.tar.gz
rm -f dist.tar.gz

ssh deploy@185.170.112.42 '
  cd /home/deploy/openchatcut
  git fetch origin custom && git reset --hard origin/custom
  rm -rf dist.old && mv dist dist.old && mkdir dist && tar -xzf dist.tar.gz -C dist && rm -f dist.tar.gz
  export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  pm2 restart openchatcut
'
```
**Total deployment time: ~20 seconds.**

---

## 2. Production Environment & Paths

| Item | Path / Location | Notes |
|---|---|---|
| **VPS Server** | `deploy@185.170.112.42` | SSH configured via local key |
| **App Root** | `/home/deploy/openchatcut` | Git clone on branch `custom` |
| **Public URL** | `https://editor.kashida.io` | Cloudflare proxy &rarr; Nginx &rarr; localhost:5174 |
| **Process Manager**| `pm2` | Process `openchatcut` (port 5174) |
| **User SQLite DB** | `/home/deploy/.openchatcut/project-store-v1.sqlite3` | **CRITICAL**: Never delete or overwrite |
| **Media Uploads** | `/home/deploy/openchatcut/public/media/uploads/` | **CRITICAL**: Never delete or overwrite |
| **Cloudflare R2** | Bucket `videos`, account `45abe1d8ea82c781d110440d1f0c68c3` | Source of truth for cloud media |

---

## 3. Bot Integrations

Both bots run under PM2 on the same VPS:
- **Telegram Bot**: `/home/deploy/telegram-video-bot` (`pm2 restart telegram-video-bot`)
- **Teams Bot**: `/home/deploy/teams-video-bot` (`pm2 restart teams-video-bot`)

To deploy updates to either bot:
```bash
cd <bot-folder> && npm run build
scp dist/<file>.js deploy@185.170.112.42:/home/deploy/<bot-folder>/dist/
ssh deploy@185.170.112.42 "pm2 restart <bot-name>"
```

---

## 4. Cloudflare R2 Media Serving Architecture

OpenChatCut uses an **Upload Write-Through + Read-Through Hydration Cache**:
- When requesting `/media/uploads/<filename>`:
  1. OpenChatCut checks local disk at `public/media/uploads/<filename>`.
  2. If missing, it fetches `uploads/<filename>` from R2 via `@aws-sdk/client-s3`, caches it to disk, and streams it.
- **Internal Preview Proxy**:
  - `/api/preview-proxy?src=/media/uploads/<filename>` spawns `/usr/bin/ffprobe` to compute duration, dimensions, and audio peaks.
  - If ffprobe fails or lacks execute permissions, video files will fail to load in the editor. Always verify this endpoint returns `HTTP 200`.

