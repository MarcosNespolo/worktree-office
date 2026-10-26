import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../../../core/src/constants.js';
import { bearerTokenValid } from '../wsAuth.js';
import { UPLOAD_KEEP_MS, UPLOAD_MAX_BYTES, UPLOAD_TYPES, UPLOADS_DIR_NAME } from './constants.js';

export function uploadsDir(): string {
  return path.join(os.homedir(), SERVER_JSON_DIR, UPLOADS_DIR_NAME);
}

export function isUploadPath(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string' || !candidate) return false;
  const resolved = path.resolve(candidate);
  const dir = uploadsDir();
  const inside =
    process.platform === 'win32'
      ? resolved.toLowerCase().startsWith(`${dir.toLowerCase()}${path.sep}`)
      : resolved.startsWith(`${dir}${path.sep}`);
  return inside && path.dirname(resolved) === path.resolve(dir);
}

export function withImages(text: string, images: readonly string[]): string {
  const paths = images.filter(isUploadPath);
  if (paths.length === 0) return text;
  return `${text.replace(/\s+$/, '')}\n\n${paths.join('\n')}`;
}

export function pruneUploads(now = Date.now()): number {
  const dir = uploadsDir();
  let removed = 0;
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > UPLOAD_KEEP_MS) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch {
      continue;
    }
  }
  return removed;
}

export function registerUploadRoute(app: FastifyInstance, token: string): void {
  const types = Object.keys(UPLOAD_TYPES);
  app.addContentTypeParser(
    types,
    { parseAs: 'buffer', bodyLimit: UPLOAD_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );
  app.post<{ Body: Buffer }>(
    '/api/uploads',
    {
      bodyLimit: UPLOAD_MAX_BYTES,
      preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        if (!bearerTokenValid(request.headers.authorization, token)) {
          reply.code(401).send('unauthorized');
        }
      },
    },
    async (request, reply) => {
      const type = (request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      const extension = UPLOAD_TYPES[type];
      if (!extension || !Buffer.isBuffer(request.body) || request.body.length === 0) {
        reply.code(415).send({ error: `Send an image as one of: ${types.join(', ')}.` });
        return;
      }
      const dir = uploadsDir();
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${randomUUID()}.${extension}`);
      fs.writeFileSync(file, request.body);
      reply.send({ path: file, bytes: request.body.length });
    },
  );
}
