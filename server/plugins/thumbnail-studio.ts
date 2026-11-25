import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { putUploadFile } from '../r2.ts';

const DEFAULT_IMAGE_SYSTEM_URL = 'http://127.0.0.1:8090';

function imageSystemBaseUrl(): string {
  const configured = process.env.IMAGE_SYSTEM_URL?.trim();
  return (configured || DEFAULT_IMAGE_SYSTEM_URL).replace(/\/+$/, '');
}

async function readRequestBody(req: IncomingMessage, maxBytes = 40 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error('Request payload too large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Proxies /api/thumbnail-studio/* to the local image_system FastAPI server (/thumbnail/*).
 * Also mirrors newly generated cover_<projectId>.jpg files to Cloudflare R2 when configured.
 */
export function thumbnailStudioPlugin(): Plugin {
  const setupServer = (server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => void } }) => {
    server.middlewares.use('/api/thumbnail-studio', (req, res) => {
      void (async () => {
        try {
          const method = (req.method ?? 'GET').toUpperCase();
          const subPath = (req.url ?? '/').startsWith('/') ? (req.url ?? '/') : `/${req.url ?? ''}`;
          const targetUrl = `${imageSystemBaseUrl()}/thumbnail${subPath}`;

          const headers: Record<string, string> = {};
          const ct = req.headers['content-type'];
          if (typeof ct === 'string' && ct) headers['content-type'] = ct;
          const accept = req.headers['accept'];
          if (typeof accept === 'string' && accept) headers['accept'] = accept;

          let body: Buffer | undefined;
          if (method !== 'GET' && method !== 'HEAD') {
            body = await readRequestBody(req);
          }

          const upstream = await fetch(targetUrl, {
            method,
            headers,
            body: body ? new Uint8Array(body) : undefined,
          });

          const upstreamType = upstream.headers.get('content-type') || 'application/json';
          const respBuf = Buffer.from(await upstream.arrayBuffer());

          // Best-effort Cloudflare R2 sync when a project cover is rendered and saved on disk
          if (
            upstream.ok
            && method === 'POST'
            && subPath.startsWith('/generate')
            && upstreamType.includes('application/json')
          ) {
            try {
              const parsed = JSON.parse(respBuf.toString('utf8')) as { output_path?: string };
              if (parsed.output_path && existsSync(parsed.output_path)) {
                const name = basename(parsed.output_path);
                const mime = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
                void putUploadFile(name, parsed.output_path, mime).catch(() => {});
              }
            } catch {
              // Never fail the HTTP response if R2 mirror fails
            }
          }

          res.statusCode = upstream.status;
          res.setHeader('Content-Type', upstreamType);
          res.setHeader('Cache-Control', 'no-store');
          res.end(respBuf);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'error',
            detail: `Thumbnail service unavailable: ${message}`,
          }));
        }
      })();
    });
  };

  return {
    name: 'openchatcut-thumbnail-studio',
    configureServer: setupServer,
    configurePreviewServer: setupServer,
  };
}
