import { serverToken } from '../transport/serverToken.js';

export const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export function isImageFile(file: File): boolean {
  return IMAGE_TYPES.has(file.type);
}

export async function uploadImage(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('Only PNG, JPEG, GIF and WebP images can be attached.');
  if (file.size > IMAGE_MAX_BYTES) throw new Error('Images must be 20 MB or smaller.');
  if (!serverToken) throw new Error('Open the office with its tokened URL to attach images.');
  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { Authorization: `Bearer ${serverToken}`, 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
  const body = (await response.json()) as { path?: unknown };
  if (typeof body.path !== 'string' || !body.path) throw new Error('Upload returned no path.');
  return body.path;
}
