import * as fs from 'fs';
import * as path from 'path';

import { extractContextTokens } from '../contextUsage.js';

interface FileUsage {
  offset: number;
  total: number;
  seen: Set<string>;
}

interface UsageRecord {
  type?: string;
  message?: { id?: string };
}

function usageOf(line: string, seen: Set<string>): number {
  let record: UsageRecord;
  try {
    record = JSON.parse(line) as UsageRecord;
  } catch {
    return 0;
  }
  if (record.type !== 'assistant') return 0;
  const tokens = extractContextTokens(record);
  if (tokens <= 0) return 0;
  const id = record.message?.id;
  if (id) {
    if (seen.has(id)) return 0;
    seen.add(id);
  }
  return tokens;
}

function sizeOf(file: string): number | null {
  try {
    return fs.statSync(file).size;
  } catch {
    return null;
  }
}

function readFrom(file: string, start: number, length: number): Buffer | null {
  try {
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(file, 'r');
    try {
      fs.readSync(fd, buffer, 0, length, start);
    } finally {
      fs.closeSync(fd);
    }
    return buffer;
  } catch {
    return null;
  }
}

function subagentFiles(file: string): string[] {
  const dir = path.join(path.dirname(file), path.basename(file, '.jsonl'), 'subagents');
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

export class UsageMeter {
  private readonly files = new Map<string, FileUsage>();

  tokens(file: string): number {
    if (!file) return 0;
    let total = this.fileTokens(file);
    for (const sub of subagentFiles(file)) total += this.fileTokens(sub);
    return total;
  }

  private fileTokens(file: string): number {
    const state = this.files.get(file) ?? { offset: 0, total: 0, seen: new Set<string>() };
    this.files.set(file, state);
    const size = sizeOf(file);
    if (size === null) return state.total;
    if (size < state.offset) {
      state.offset = 0;
      state.total = 0;
      state.seen.clear();
    }
    if (size === state.offset) return state.total;
    const buffer = readFrom(file, state.offset, size - state.offset);
    const end = buffer ? buffer.lastIndexOf(10) : -1;
    if (!buffer || end < 0) return state.total;
    for (const line of buffer.subarray(0, end).toString('utf8').split('\n')) {
      if (line.trim()) state.total += usageOf(line, state.seen);
    }
    state.offset += end + 1;
    return state.total;
  }
}
