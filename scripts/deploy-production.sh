#!/usr/bin/env bash
# Production Deployment Script for OpenChatCut / Kashida Editor
# Deploys in ~25 seconds via Mac Local Build + SCP + PM2 Atomic Swap
set -euo pipefail

VPS_HOST="${VPS_HOST:-185.170.112.42}"
VPS_USER="${VPS_USER:-deploy}"
REMOTE="${VPS_USER}@${VPS_HOST}"
REMOTE_DIR="/home/deploy/openchatcut"

echo "🚀 [1/5] Building production bundle locally on Mac..."
npm run build

echo "📦 [2/5] Packaging dist directory..."
COPYFILE_DISABLE=1 tar --no-xattrs -czf dist.tar.gz -C dist .
ARCHIVE_SIZE=$(du -h dist.tar.gz | cut -f1)
echo "   Package created: dist.tar.gz ($ARCHIVE_SIZE)"

echo "📥 [3/5] Uploading bundle to VPS ($REMOTE)..."
scp dist.tar.gz "$REMOTE:$REMOTE_DIR/dist.tar.gz"
rm -f dist.tar.gz

echo "🔄 [4/5] Syncing repo and performing atomic PM2 swap on VPS..."
ssh "$REMOTE" "
  set -euo pipefail
  cd $REMOTE_DIR

  # Sync server-side code without touching .env.local or uploads
  git fetch origin custom
  git reset --hard origin/custom

  # Swap dist folder atomically
  rm -rf dist.old
  mv dist dist.old
  mkdir dist
  tar -xzf dist.tar.gz -C dist
  rm -f dist.tar.gz

  # Ensure NVM and PM2 environment
  export NVM_DIR=\"\$HOME/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\"

  # Restart PM2 process
  pm2 restart openchatcut 2>/dev/null || pm2 start \"node node_modules/vite/bin/vite.js preview --config config/vite.config.ts --port 5174 --host 0.0.0.0\" --name openchatcut
  pm2 save
"

echo "🔍 [5/5] Running health checks (waiting for Vite warmup)..."
ssh "$REMOTE" '
  for i in $(seq 1 15); do
    if curl -sf -I http://127.0.0.1:5174/ >/dev/null 2>&1; then
      echo "   ✅ Internal healthcheck OK after ${i}s (127.0.0.1:5174)"
      exit 0
    fi
    sleep 1
  done
  echo "   ❌ Healthcheck timed out after 15s"
  exit 1
'
curl -sf -I https://editor.kashida.io/ >/dev/null && echo "   ✅ Public domain OK (https://editor.kashida.io)"

echo "🎉 Deployment completed successfully in seconds!"
