# Deployment Lessons Learned — OpenChatCut VPS

A record of every issue hit while deploying the OpenChatCut video editor to a Linux VPS,
and what to do differently next time.

---

## 1. Static Assets Return 404 After Deploy

**What happened:**  
After the first deployment, the browser console showed dozens of 404 errors for
`/assets/index-*.css`, `/assets/*.js`, etc.

**Root cause:**  
The VPS was running `vite preview` without a freshly built `dist/` folder, or the
built `dist/` was incomplete / from a failed build.

**Fix:**  
Always run `npm run build` first and confirm the `dist/` directory is populated
before starting `vite preview`. Check with:
```bash
ls /home/deploy/openchatcut/dist/assets/ | head
```

---

## 2. GitHub Actions Workflows Failed (Secrets Not Set)

**What happened:**  
Every CI/CD push to the `custom` branch triggered a deploy workflow that failed
immediately because `VPS_HOST`, `VPS_USERNAME`, and `VPS_SSH_KEY` were hard-coded
or missing.

**Root cause:**  
Sensitive values (server IP, SSH key) were either committed to the repo in plain text
or the GitHub Actions secrets were never configured.

**Fix:**  
Set secrets via the `gh` CLI — never commit them to the repo:
```bash
gh secret set VPS_HOST      --body "your.vps.ip"
gh secret set VPS_USERNAME  --body "deploy"
gh secret set VPS_SSH_KEY   < ~/.ssh/id_ed25519
```
Reference them in workflows as `${{ secrets.VPS_HOST }}` etc.

**Rule:** Any IP address, password, or key that appears in a workflow YAML file is a
security risk. Use secrets.

---

## 3. Project Store Unavailable Error

**What happened:**  
Opening the editor in a browser at `http://<VPS-IP>:5174/` showed a loading screen
that never completed. The browser console showed:
```
Error: 共享工程数据库暂时不可用，工程未保存
```

**Root cause:**  
`projectStoreWriteCredential()` returned `false` for plain browser sessions without a
launch token. This caused `sharedKv` to go into read-only mode on bootstrap.

**Fix:**  
Updated `projectStoreWriteCredential()` to also grant write access when
`OPENCHATCUT_ALLOW_REMOTE_HOSTS=1` is set in `.env.local`, and updated the server's
`projectStoreHttpAuthorized()` to accept same-origin browser requests.

**Key insight:** The app was designed for desktop (Electron) + iframe embedding. Bare
browser access needs explicit opt-in via env var.

---

## 4. Read-Only Mode on New Project

**What happened:**  
Clicking "New Project" threw:
```
Error: 共享工程库为只读模式（未连接编辑器会话），修改未同步
```

**Root cause:**  
`sharedKv` checked `projectStoreWriteCredential()` before every write operation.
Without a session token or launch token in the URL hash, all writes were rejected.

**Fix:**  
The `OPENCHATCUT_ALLOW_REMOTE_HOSTS=1` env var (set in `.env.local` and compiled into
the bundle at build time by Vite) bypassed the session check so the web editor could
write projects normally.

---

## 5. OOM (Out of Memory) During On-Server Build

**What happened:**  
Running `npm run build` directly on the VPS caused RAM to hit 100%. The `tsc -b`
TypeScript compiler was killed mid-run, which corrupted `node_modules` (specifically
the `remotion` package).

**Root cause:**  
The VPS had limited RAM and no swap space. `tsc -b` on a large TypeScript project
is extremely memory-hungry (2-4 GB peak usage).

**What broke as a side effect:**  
`node_modules/remotion/dist/esm/version.mjs` was left partially written, causing
`vite preview` to crash-loop — resulting in a **black screen** in the browser.

**Fix (immediate):**
- Build locally on Mac (where RAM is sufficient)
- Upload the resulting `dist/` to the VPS via `scp`
- Run `npm ci --ignore-scripts` on the VPS to fix the corrupted `node_modules`

**Fix (permanent — choose one):**

1. Add swap to the VPS:
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
2. Never build on the VPS — always build locally and upload `dist/`
3. Build in GitHub Actions (free Ubuntu runners have 7 GB RAM) and deploy only the
   pre-built `dist/`

---

## 6. pm2 Not Found Over SSH

**What happened:**  
Running `ssh deploy@host "pm2 restart ..."` returned `pm2: command not found`.

**Root cause:**  
`pm2` is installed via NVM. Non-interactive SSH sessions do not source shell profiles,
so NVM is not initialized and `pm2` is not in PATH.

**Fix:**  
Always source NVM explicitly in SSH commands:
```bash
ssh deploy@your.vps.ip '
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  pm2 restart openchatcut
'
```

---

## 7. rsync Not Installed on VPS

**What happened:**  
Trying to use `rsync` to upload to the VPS failed with `rsync: command not found`.

**Root cause:**  
The VPS (Ubuntu minimal) did not have `rsync` installed.

**Fix:**  
Use `scp` + `tar` instead:
```bash
# On Mac
tar -czf dist.tar.gz -C dist .
scp dist.tar.gz deploy@your.vps.ip:/home/deploy/openchatcut/

# On VPS
cd /home/deploy/openchatcut
rm -rf dist && mkdir dist
tar -xzf dist.tar.gz -C dist
rm dist.tar.gz
```

---

## 8. xdg-open Errors in PM2 Logs (Harmless)

**What happened:**  
PM2 logs were flooded with `Error: spawn xdg-open ENOENT`.

**Root cause:**  
`vite preview` tries to open the browser automatically using `xdg-open`.
The VPS has no desktop environment so `xdg-open` does not exist.

**Impact:** None — the server still serves pages correctly.

**Fix (optional):** Set `BROWSER=none` in the PM2 env config or `.env` file.

---

## 9. TypeScript Error in e2b Package Types After OOM

**What happened:**  
After the OOM-corrupted build, `tsc -b` reported:
```
node_modules/e2b/dist/index.d.ts(10426,2136): error TS1005: '}' expected.
```

**Root cause:**  
The `e2b` package's type definition file was truncated mid-write during the OOM crash.

**Fix:**  
```bash
npm ci --ignore-scripts
```

---

## 10. Changing Core Functions Requires Updating Verification Tests

**What happened:**  
Updating `projectStoreWriteCredential()` caused `npm run verify:project-store-transport`
to fail because existing unit tests asserted the old behaviour.

**Fix:**  
Run `npm run verify:project-store-transport` locally before every push and update
any failing test assertions when a function's contract changes.

---

## 11. GitHub Actions + Docker GHCR Pull Timeouts on VPS

**What happened:**  
Every push to `custom` triggered `.github/workflows/docker-ghcr.yml`, which built a Docker image, pushed to GHCR, and ran `docker pull` on the VPS via SSH. Every deploy timed out after 10 minutes with `Run Command Timeout`.

**Root cause:**  
- The Docker image was ~1.8 GB to 2.5 GB.
- Pulling large layers from GHCR over the VPS network connection took longer than the default 10-minute timeout of `appleboy/ssh-action`.
- Because the command was killed mid-pull, the new container was never started, leaving production running outdated containers.

**Fix:**  
Remove Docker GHCR deployment. Use the local build + atomic `dist.tar.gz` SCP script (`scripts/deploy-production.sh`). Transferring 3.5 MB takes 2 seconds and deploys in under 25 seconds total.

---

## 12. `npm ci --ignore-scripts` Stripping Execute Permissions (`ffprobe EACCES`)

**What happened:**  
Videos uploaded to R2 and served at `/media/uploads/<file>.mp4` failed to play or load in the editor. Probing `/api/preview-proxy?src=/media/uploads/...` crashed with:
```json
{"error": "spawn /app/node_modules/@ffprobe-installer/linux-x64/ffprobe EACCES"}
```

**Root cause:**  
- Dockerfile used `npm ci --ignore-scripts`.
- Skipping lifecycle scripts prevented `@ffprobe-installer` from marking its bundled binary as executable (`chmod +x`).
- `server/media-binaries.ts` preferred the non-executable npm path over system `/usr/bin/ffprobe`.

**Fix:**  
1. Updated `server/media-binaries.ts` to check `accessSync(path, constants.X_OK)`. If the vendored binary is not executable, it automatically falls back to system `ffprobe` on PATH.
2. Removed Docker container and ran OpenChatCut directly under host PM2, where system `/usr/bin/ffprobe` and `/usr/bin/ffmpeg` run natively without container permission issues.

---

## Summary Checklist for Future Deployments

| Step | Command / Action |
|------|-----------------|
| Fast One-Command Deploy | `./scripts/deploy-production.sh` |
| Build locally | `npm run build` |
| Run verification tests | `npm run verify:project-store-transport` |
| Upload dist to VPS | `scp` + `tar` (see section 7) |
| Restart PM2 with NVM sourced | Source NVM first, then `pm2 restart openchatcut` (see section 6) |
| Check server logs | `pm2 logs openchatcut --lines 30 --nostream` |
| Never use Docker GHCR for deployments | Stick to lightweight local build + SCP (see section 11) |
| Keep secrets out of code | Use `gh secret set` and `${{ secrets.NAME }}` (see section 2) |
