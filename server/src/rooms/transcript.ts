import * as fs from 'fs';

import { TRANSCRIPT_HEAD_BYTES } from './constants.js';

function readHead(file: string, bytes: number): string | null {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const read = fs.readSync(fd, buffer, 0, bytes, 0);
      return buffer.subarray(0, read).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export interface TranscriptOrigin {
  cwd?: string;
  app?: string;
}

export function transcriptOrigin(file: string): TranscriptOrigin {
  const origin: TranscriptOrigin = {};
  if (!file) return origin;
  const head = readHead(file, TRANSCRIPT_HEAD_BYTES);
  if (!head) return origin;
  for (const line of head.split('\n')) {
    if (!line.includes('"cwd"') && !line.includes('"entrypoint"')) continue;
    let record: { cwd?: unknown; entrypoint?: unknown };
    try {
      record = JSON.parse(line) as { cwd?: unknown; entrypoint?: unknown };
    } catch {
      continue;
    }
    if (!origin.cwd && typeof record.cwd === 'string' && record.cwd) origin.cwd = record.cwd;
    if (!origin.app && typeof record.entrypoint === 'string' && record.entrypoint) {
      origin.app = record.entrypoint;
    }
    if (origin.cwd && origin.app) break;
  }
  return origin;
}

export function transcriptCwd(file: string): string | undefined {
  return transcriptOrigin(file).cwd;
}
