import * as fs from 'fs';

import { ACTIVITY_TAIL_STEPS } from './constants.js';

const CONVERSATION_TYPES = new Set(['user', 'assistant', 'system']);

interface CachedActivity {
  size: number;
  mtimeMs: number;
  lastAt: number | null;
}

function readTail(file: string, size: number, bytes: number): string | null {
  const start = Math.max(0, size - bytes);
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      const text = buffer.toString('utf8');
      return start > 0 ? text.slice(text.indexOf('\n') + 1) : text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function lastConversationIn(text: string): number | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('"timestamp"')) continue;
    let record: { type?: unknown; timestamp?: unknown };
    try {
      record = JSON.parse(line) as { type?: unknown; timestamp?: unknown };
    } catch {
      continue;
    }
    if (typeof record.type !== 'string' || !CONVERSATION_TYPES.has(record.type)) continue;
    if (typeof record.timestamp !== 'string') continue;
    const at = Date.parse(record.timestamp);
    if (Number.isFinite(at)) return at;
  }
  return null;
}

export class SessionActivity {
  private readonly cache = new Map<string, CachedActivity>();

  lastAt(file: string): number | null {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      this.cache.delete(file);
      return null;
    }
    const cached = this.cache.get(file);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      return cached.lastAt;
    }
    let lastAt: number | null = null;
    for (const bytes of ACTIVITY_TAIL_STEPS) {
      const text = readTail(file, stat.size, bytes);
      if (text === null) break;
      lastAt = lastConversationIn(text);
      if (lastAt !== null || bytes >= stat.size) break;
    }
    this.cache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, lastAt });
    return lastAt;
  }

  isRecent(file: string, windowMs: number, now = Date.now()): boolean {
    const at = this.lastAt(file);
    return at !== null && now - at <= windowMs;
  }
}
