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

export function transcriptCwd(file: string): string | undefined {
  if (!file) return undefined;
  const head = readHead(file, TRANSCRIPT_HEAD_BYTES);
  if (!head) return undefined;
  for (const line of head.split('\n')) {
    if (!line.includes('"cwd"')) continue;
    try {
      const record = JSON.parse(line) as { cwd?: unknown };
      if (typeof record.cwd === 'string' && record.cwd) return record.cwd;
    } catch {
      continue;
    }
  }
  return undefined;
}
