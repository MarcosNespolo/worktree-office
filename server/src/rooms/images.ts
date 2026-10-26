import { createHash } from 'crypto';
import type { FastifyInstance } from 'fastify';

import { bearerTokenValid } from '../wsAuth.js';
import { IMAGE_CACHE_MAX_BYTES, UPLOAD_TYPES } from './constants.js';

interface CachedImage {
  type: string;
  data: Buffer;
}

const cache = new Map<string, CachedImage>();
let cachedBytes = 0;

export function rememberImage(mediaType: string, base64: string): string | null {
  if (!Object.hasOwn(UPLOAD_TYPES, mediaType)) return null;
  const hash = createHash('sha1').update(base64).digest('hex').slice(0, 20);
  const hit = cache.get(hash);
  if (hit) {
    cache.delete(hash);
    cache.set(hash, hit);
    return hash;
  }
  const data = Buffer.from(base64, 'base64');
  cache.set(hash, { type: mediaType, data });
  cachedBytes += data.length;
  for (const [oldest, image] of cache) {
    if (cachedBytes <= IMAGE_CACHE_MAX_BYTES || oldest === hash) break;
    cache.delete(oldest);
    cachedBytes -= image.data.length;
  }
  return hash;
}

export function registerImageRoute(app: FastifyInstance, token: string): void {
  app.get<{ Params: { hash: string }; Querystring: { token?: string } }>(
    '/api/images/:hash',
    async (request, reply) => {
      const fromQuery =
        typeof request.query.token === 'string' ? `Bearer ${request.query.token}` : undefined;
      if (
        !bearerTokenValid(request.headers.authorization, token) &&
        !bearerTokenValid(fromQuery, token)
      ) {
        return reply.code(401).send({ error: 'A valid token is required.' });
      }
      const image = cache.get(request.params.hash);
      if (!image) return reply.code(404).send({ error: 'This image is no longer cached.' });
      return reply
        .header('Content-Type', image.type)
        .header('Cache-Control', 'private, max-age=86400')
        .send(image.data);
    },
  );
}
