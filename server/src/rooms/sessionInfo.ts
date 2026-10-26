import * as fs from 'fs';

import type { AgentStateStore } from '../agentStateStore.js';
import type { SessionActivity } from './activity.js';
import {
  SESSION_INFO_BROADCAST_MS,
  SESSION_INFO_POLL_MS,
  SESSION_INFO_TAIL_BYTES,
  SESSION_LAST_TEXT_HEAD,
  SESSION_LAST_TEXT_MAX,
  SESSION_PR_LINKS_MAX,
} from './constants.js';
import { transcriptOrigin } from './transcript.js';

export interface SessionInfo {
  id: number;
  title: string | null;
  lastActivityAt: number | null;
  lastText: string | null;
  prNumbers: number[];
  app: string | null;
}

export interface SessionsSnapshot {
  type: 'sessionsInfo';
  sessions: SessionInfo[];
}

export interface SessionInfoDeps {
  store: AgentStateStore;
  activity: SessionActivity;
}

interface FileState {
  offset: number;
  skipFirstLine: boolean;
  aiTitle: string | null;
  customTitle: string | null;
  lastText: string | null;
  prLinks: Map<number, number>;
}

const MARKERS = ['"ai-title"', '"custom-title"', '"pr-link"', '"assistant"'];

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function textOf(content: unknown): string | null {
  if (typeof content === 'string') return nonEmpty(content);
  if (!Array.isArray(content)) return null;
  const parts = content
    .filter(
      (block): block is { type: string; text: string } =>
        !!block && block.type === 'text' && typeof block.text === 'string',
    )
    .map((block) => block.text);
  return nonEmpty(parts.join(' '));
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= SESSION_LAST_TEXT_MAX) return flat;
  const tail = SESSION_LAST_TEXT_MAX - SESSION_LAST_TEXT_HEAD;
  return `${flat.slice(0, SESSION_LAST_TEXT_HEAD).trimEnd()} … ${flat.slice(-tail).trimStart()}`;
}

function applyLine(state: FileState, line: string): void {
  if (!MARKERS.some((marker) => line.includes(marker))) return;
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return;
  }
  switch (record.type) {
    case 'ai-title':
      state.aiTitle = nonEmpty(record.aiTitle) ?? state.aiTitle;
      break;
    case 'custom-title':
      state.customTitle = nonEmpty(record.customTitle) ?? state.customTitle;
      break;
    case 'pr-link':
      if (typeof record.prNumber === 'number') {
        const at = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
        state.prLinks.set(record.prNumber, Number.isFinite(at) ? at : Date.now());
      }
      break;
    case 'assistant': {
      if (record.isSidechain === true) break;
      const text = textOf((record.message as { content?: unknown } | undefined)?.content);
      if (text) state.lastText = excerpt(text);
      break;
    }
  }
}

function readRange(file: string, start: number, length: number): Buffer | null {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const read = fs.readSync(fd, buffer, 0, length, start);
      return buffer.subarray(0, read);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export class SessionInfoTracker {
  private readonly files = new Map<string, FileState>();
  private readonly apps = new Map<string, string>();
  private readonly timer: ReturnType<typeof setInterval>;
  private lastSent = '';
  private lastSentAt = 0;

  constructor(private readonly deps: SessionInfoDeps) {
    this.timer = setInterval(() => this.publish(), SESSION_INFO_POLL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  snapshot(): SessionsSnapshot {
    const sessions: SessionInfo[] = [];
    const used = new Set<string>();
    for (const agent of this.deps.store.values()) {
      if (!agent.jsonlFile) continue;
      used.add(agent.jsonlFile);
      const state = this.update(agent.jsonlFile);
      sessions.push({
        id: agent.id,
        title: state?.customTitle ?? state?.aiTitle ?? null,
        lastActivityAt: this.deps.activity.lastAt(agent.jsonlFile),
        lastText: state?.lastText ?? null,
        prNumbers: state
          ? [...state.prLinks.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, SESSION_PR_LINKS_MAX)
              .map(([number]) => number)
          : [],
        app: this.appOf(agent.jsonlFile),
      });
    }
    for (const file of [...this.files.keys()]) {
      if (!used.has(file)) this.files.delete(file);
    }
    for (const file of [...this.apps.keys()]) {
      if (!used.has(file)) this.apps.delete(file);
    }
    sessions.sort((a, b) => a.id - b.id);
    return { type: 'sessionsInfo', sessions };
  }

  publish(): void {
    const snapshot = this.snapshot();
    const serialized = JSON.stringify(snapshot);
    const now = Date.now();
    if (serialized === this.lastSent && now - this.lastSentAt < SESSION_INFO_BROADCAST_MS) return;
    this.lastSent = serialized;
    this.lastSentAt = now;
    this.deps.store.broadcast(snapshot as unknown as Record<string, unknown>);
  }

  private appOf(file: string): string | null {
    if (this.apps.has(file)) return this.apps.get(file) ?? null;
    const app = transcriptOrigin(file).app ?? null;
    if (app) this.apps.set(file, app);
    return app;
  }

  private update(file: string): FileState | null {
    let size: number;
    try {
      size = fs.statSync(file).size;
    } catch {
      return this.files.get(file) ?? null;
    }
    let state = this.files.get(file);
    if (!state || size < state.offset) {
      const start = Math.max(0, size - SESSION_INFO_TAIL_BYTES);
      state = {
        offset: start,
        skipFirstLine: start > 0,
        aiTitle: null,
        customTitle: null,
        lastText: null,
        prLinks: new Map(),
      };
      this.files.set(file, state);
    }
    if (size <= state.offset) return state;
    const buffer = readRange(file, state.offset, size - state.offset);
    const end = buffer ? buffer.lastIndexOf(10) : -1;
    if (!buffer || end < 0) return state;
    let lines = buffer.subarray(0, end).toString('utf8').split('\n');
    if (state.skipFirstLine) {
      lines = lines.slice(1);
      state.skipFirstLine = false;
    }
    for (const line of lines) applyLine(state, line);
    state.offset += end + 1;
    return state;
  }
}
