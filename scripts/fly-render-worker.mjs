import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { renderTimeline, setUploadsDirProvider } from '../remotion/render.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS_DIR = path.join(REPO_ROOT, 'public', 'media', 'uploads');
const PORT = Number(process.env.PORT || 8080);
const WORKER_SECRET = process.env.RENDER_WORKER_SECRET || '';
const MEDIA_FALLBACK_BASE_URL = (
  process.env.MEDIA_FALLBACK_BASE_URL || 'https://editor.kashida.io/media/uploads'
).replace(/\/+$/, '');

setUploadsDirProvider(() => UPLOADS_DIR);

function createR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    bucket,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

const r2 = createR2Client();

/** Simple in-process mutex so a single Fly Machine never OOMs on concurrent renders. */
let renderQueue = Promise.resolve();
function runSerialized(fn) {
  const next = renderQueue.then(fn, fn);
  renderQueue = next.catch(() => {});
  return next;
}

async function readJsonBody(req, maxBytes = 25 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Download any /media/uploads/<file> referenced by project into UPLOADS_DIR. */
async function hydrateProjectMedia(projectDoc) {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const raw = JSON.stringify(projectDoc);
  const mediaRegex = /\/media\/uploads\/([a-zA-Z0-9_\-.]+)/g;
  const filenames = new Set();
  let match;
  while ((match = mediaRegex.exec(raw)) !== null) {
    filenames.add(match[1]);
  }

  for (const filename of filenames) {
    const dest = path.join(UPLOADS_DIR, filename);
    if (existsSync(dest)) continue;

    let downloaded = false;
    if (r2) {
      try {
        const res = await r2.client.send(
          new GetObjectCommand({ Bucket: r2.bucket, Key: `uploads/${filename}` })
        );
        if (res.Body) {
          const buf = await streamToBuffer(res.Body);
          await writeFile(dest, buf);
          console.log(`[FlyRenderWorker] Hydrated ${filename} from R2 (${buf.length} bytes)`);
          downloaded = true;
        }
      } catch (err) {
        console.warn(`[FlyRenderWorker] R2 miss for ${filename}:`, err?.message || err);
      }
    }

    if (!downloaded && MEDIA_FALLBACK_BASE_URL) {
      const url = `${MEDIA_FALLBACK_BASE_URL}/${encodeURIComponent(filename)}`;
      const res = await fetch(url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(dest, buf);
        console.log(`[FlyRenderWorker] Hydrated ${filename} from ${url} (${buf.length} bytes)`);
        downloaded = true;
      } else {
        console.warn(`[FlyRenderWorker] HTTP ${res.status} fetching ${url}`);
      }
    }

    if (!downloaded) {
      console.warn(`[FlyRenderWorker] Could not hydrate media file: ${filename}`);
    }
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && urlPath === '/health') {
    return sendJson(res, 200, { ok: true, r2Configured: Boolean(r2) });
  }

  if (req.method === 'POST' && urlPath === '/render') {
    if (WORKER_SECRET) {
      const auth = req.headers.authorization || '';
      if (auth !== `Bearer ${WORKER_SECRET}`) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err?.message || 'Invalid JSON body' });
    }

    const projectId = String(body?.projectId || '').replace(/[^a-zA-Z0-9_-]/g, '') || 'project';
    const project = body?.project;
    if (!project || !Array.isArray(project.timelines) || project.timelines.length === 0) {
      return sendJson(res, 400, { error: 'project with timelines[] is required' });
    }

    const timelineId = body?.timelineId || project.activeTimelineId || project.timelines[0]?.id || '0';
    const state = project.timelines.find((t) => t.id === timelineId) || project.timelines[0];
    const codec = body?.codec || 'h264';
    const outputLocation = `/tmp/fly_rendered_${projectId}_${Date.now()}.mp4`;

    try {
      await runSerialized(async () => {
        const startedAt = Date.now();
        console.log(`[FlyRenderWorker] Starting render for ${projectId} (timeline ${timelineId})...`);
        await hydrateProjectMedia(project);
        await renderTimeline({
          state,
          project,
          timelineId,
          codec,
          outputLocation,
          onProgress: (p) => {
            const pct = Math.round(p * 100);
            if (pct % 20 === 0) {
              console.log(`[FlyRenderWorker] ${projectId} progress: ${pct}%`);
            }
          },
        });
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
        console.log(`[FlyRenderWorker] Finished ${projectId} in ${elapsed}s`);

        if (r2) {
          try {
            const { readFile } = await import('node:fs/promises');
            const mp4Buf = await readFile(outputLocation);
            await r2.client.send(
              new PutObjectCommand({
                Bucket: r2.bucket,
                Key: `renders/rendered_${projectId}.mp4`,
                Body: mp4Buf,
                ContentType: 'video/mp4',
              })
            );
            console.log(`[FlyRenderWorker] Uploaded renders/rendered_${projectId}.mp4 to R2`);
          } catch (r2Err) {
            console.warn('[FlyRenderWorker] Failed to upload output to R2:', r2Err?.message || r2Err);
          }
        }
      });

      const info = await stat(outputLocation);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': info.size,
        'X-Render-Project-Id': projectId,
      });
      const stream = createReadStream(outputLocation);
      stream.pipe(res);
      res.on('close', () => {
        rm(outputLocation, { force: true }).catch(() => {});
      });
    } catch (err) {
      await rm(outputLocation, { force: true }).catch(() => {});
      console.error(`[FlyRenderWorker] Render failed for ${projectId}:`, err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: err?.message || String(err) });
      }
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.requestTimeout = 30 * 60 * 1000;
server.headersTimeout = 60 * 1000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[FlyRenderWorker] Listening on 0.0.0.0:${PORT} (R2: ${Boolean(r2)})`);
});
