import type {
  BlurBox,
  ThumbnailGeneratePayload,
  ThumbnailGenerateResponse,
  ThumbnailSchemaResponse,
  ThumbnailStateResponse,
  VideoFrameCandidate,
} from './types';

const BASE = '/api/thumbnail-studio';

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { detail?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.detail || data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchThumbnailSchema(): Promise<ThumbnailSchemaResponse> {
  const res = await fetch(`${BASE}/schema`);
  return parseJson<ThumbnailSchemaResponse>(res);
}

export async function fetchThumbnailState(projectId: string): Promise<ThumbnailStateResponse> {
  const res = await fetch(`${BASE}/state/${encodeURIComponent(projectId)}`);
  return parseJson<ThumbnailStateResponse>(res);
}

export async function uploadThumbnailSource(
  projectId: string,
  file: File,
): Promise<{ image_path: string; image_url: string; width: number; height: number }> {
  const form = new FormData();
  form.append('project_id', projectId);
  form.append('file', file);
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: form,
  });
  return parseJson(res);
}

export async function fetchVideoFrames(
  videoPath: string,
  count = 6,
): Promise<{ frames: VideoFrameCandidate[] }> {
  const res = await fetch(`${BASE}/frames`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_path: videoPath, count }),
  });
  return parseJson(res);
}

export async function selectVideoFrame(
  projectId: string,
  videoPath: string,
  timestampSec: number,
): Promise<{ image_path: string; image_url: string; width: number; height: number }> {
  const res = await fetch(`${BASE}/select-frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      video_path: videoPath,
      timestamp_sec: timestampSec,
    }),
  });
  return parseJson(res);
}

export async function runAutoBlur(params: {
  project_id?: string;
  image_path?: string | null;
  video_path?: string | null;
}): Promise<{ boxes: BlurBox[]; source: string }> {
  const res = await fetch(`${BASE}/auto-blur`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJson(res);
}

export async function generateThumbnail(
  payload: ThumbnailGeneratePayload,
): Promise<ThumbnailGenerateResponse> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson<ThumbnailGenerateResponse>(res);
}
