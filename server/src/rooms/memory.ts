import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentStateStore } from '../agentStateStore.js';
import {
  CLAUDE_SESSIONS_DIR_NAME,
  FILETIME_EPOCH_OFFSET_MS,
  MEMORY_POLL_MS,
  MEMORY_SAMPLE_END,
  MEMORY_SAMPLE_TIMEOUT_MS,
  MEMORY_START_TOLERANCE_MS,
} from './constants.js';
import { runCommand } from './git.js';
import type { RoomsManager } from './manager.js';

export interface ProcessSample {
  pid: number;
  ppid: number;
  bytes: number;
  startedAt: number;
  command: string;
}

export interface SessionProcess {
  pid: number;
  sessionId: string;
  startedAt: number | null;
}

export interface MemoryAgent {
  id: number;
  sessionIds: string[];
  room: string | null;
}

export interface MemoryRoom {
  label: string;
  path: string;
}

export interface MachineMemory {
  totalBytes: number;
  freeBytes: number;
}

export interface MemoryUsage {
  rooms: Map<string, number>;
  sessions: Map<number, number>;
}

export interface MemoryReader {
  forRoom(label: string): number | null;
  forSession(agentId: number): number | null;
  machine(): MachineMemory | null;
}

export interface ProcessSampler {
  sample(): Promise<ProcessSample[] | null>;
  dispose(): void;
}

export const NO_MEMORY: MemoryReader = {
  forRoom: () => null,
  forSession: () => null,
  machine: () => null,
};

const PATH_END = /[\\/"'\s;,]/;

const WINDOWS_SAMPLER_SCRIPT = [
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false',
  'while ($null -ne [Console]::In.ReadLine()) {',
  '  $list = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,CommandLine,CreationDate | ForEach-Object {',
  '    [pscustomobject]@{ p = $_.ProcessId; q = $_.ParentProcessId; m = $_.WorkingSetSize; c = $_.CommandLine;',
  '      t = $(if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }) }',
  '  })',
  '  [Console]::Out.WriteLine(($list | ConvertTo-Json -Compress))',
  `  [Console]::Out.WriteLine('${MEMORY_SAMPLE_END}')`,
  '  [Console]::Out.Flush()',
  '  $list = $null',
  '  [GC]::Collect()',
  '}',
].join('\n');

function foldPath(text: string): string {
  return process.platform === 'win32' ? text.replaceAll('/', '\\').toLowerCase() : text;
}

function mentions(text: string, needle: string): boolean {
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    const next = text.charAt(at + needle.length);
    if (next === '' || PATH_END.test(next)) return true;
  }
  return false;
}

function roomOfCommand(
  command: string,
  needles: ReadonlyArray<{ label: string; needle: string }>,
): string | null {
  if (!command) return null;
  const text = foldPath(command);
  return needles.find((room) => mentions(text, room.needle))?.label ?? null;
}

function isChildOf(child: ProcessSample, parent: ProcessSample): boolean {
  if (child.ppid !== parent.pid || child.pid === parent.pid) return false;
  return child.startedAt === 0 || parent.startedAt === 0 || child.startedAt >= parent.startedAt;
}

function sameProcess(proc: ProcessSample, session: SessionProcess): boolean {
  if (session.startedAt !== null && proc.startedAt > 0) {
    return Math.abs(proc.startedAt - session.startedAt) <= MEMORY_START_TOLERANCE_MS;
  }
  return /claude/i.test(proc.command);
}

function commandPid(
  ids: readonly string[],
  processes: ReadonlyMap<number, ProcessSample>,
): number | null {
  const named = new Set(
    [...processes.values()].filter((proc) => ids.some((id) => proc.command.includes(id))),
  );
  for (const proc of named) {
    const parent = processes.get(proc.ppid);
    if (!parent || !named.has(parent)) return proc.pid;
  }
  return null;
}

function sessionPid(
  agent: MemoryAgent,
  sessions: ReadonlyMap<string, SessionProcess>,
  processes: ReadonlyMap<number, ProcessSample>,
): number | null {
  for (const id of agent.sessionIds) {
    const session = sessions.get(id);
    const proc = session ? processes.get(session.pid) : undefined;
    if (session && proc && sameProcess(proc, session)) return proc.pid;
  }
  return agent.sessionIds.length > 0 ? commandPid(agent.sessionIds, processes) : null;
}

function ownerOf(
  pid: number,
  processes: ReadonlyMap<number, ProcessSample>,
  roots: ReadonlyMap<number, number>,
  cache: Map<number, number | null>,
): number | null {
  const chain: number[] = [];
  let owner: number | null = null;
  let current = processes.get(pid);
  while (current) {
    const known = cache.get(current.pid);
    if (known !== undefined) {
      owner = known;
      break;
    }
    chain.push(current.pid);
    const root = roots.get(current.pid);
    if (root !== undefined) {
      owner = root;
      break;
    }
    const parent = processes.get(current.ppid);
    if (!parent || !isChildOf(current, parent) || chain.includes(parent.pid)) break;
    current = parent;
  }
  for (const id of chain) cache.set(id, owner);
  return owner;
}

function add<K>(totals: Map<K, number>, key: K, bytes: number): void {
  totals.set(key, (totals.get(key) ?? 0) + bytes);
}

export function measureMemory(
  processes: readonly ProcessSample[],
  sessions: readonly SessionProcess[],
  agents: readonly MemoryAgent[],
  rooms: readonly MemoryRoom[],
): MemoryUsage {
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]));
  const bySession = new Map(sessions.map((session) => [session.sessionId, session]));
  const roots = new Map<number, number>();
  for (const agent of agents) {
    const pid = sessionPid(agent, bySession, byPid);
    if (pid !== null && !roots.has(pid)) roots.set(pid, agent.id);
  }
  const roomOfAgent = new Map(agents.map((agent) => [agent.id, agent.room]));
  const needles = rooms
    .map((room) => ({ label: room.label, needle: foldPath(room.path).replace(/[\\/]+$/, '') }))
    .filter((room) => room.needle)
    .sort((a, b) => b.needle.length - a.needle.length);
  const usage: MemoryUsage = {
    rooms: new Map(rooms.map((room) => [room.label, 0])),
    sessions: new Map([...roots.values()].map((id) => [id, 0])),
  };
  const cache = new Map<number, number | null>();
  for (const proc of processes) {
    const owner = ownerOf(proc.pid, byPid, roots, cache);
    if (owner !== null) add(usage.sessions, owner, proc.bytes);
    const room =
      owner === null ? roomOfCommand(proc.command, needles) : (roomOfAgent.get(owner) ?? null);
    if (room !== null) add(usage.rooms, room, proc.bytes);
  }
  return usage;
}

function startedAtOf(value: unknown): number | null {
  if (process.platform !== 'win32') return null;
  const ticks = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  const ms = ticks / 10_000 - FILETIME_EPOCH_OFFSET_MS;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function readSessionProcesses(dir: string): SessionProcess[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) as Record<
          string,
          unknown
        >;
        return typeof raw.pid === 'number' && typeof raw.sessionId === 'string'
          ? [{ pid: raw.pid, sessionId: raw.sessionId, startedAt: startedAtOf(raw.procStart) }]
          : [];
      } catch {
        return [];
      }
    });
}

export function parseWindowsSample(json: string): ProcessSample[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json.replace(/^\uFEFF/, '').trim());
  } catch {
    return null;
  }
  const list = Array.isArray(raw) ? raw : [raw];
  return list.flatMap((item) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    if (typeof entry.p !== 'number') return [];
    return [
      {
        pid: entry.p,
        ppid: typeof entry.q === 'number' ? entry.q : 0,
        bytes: typeof entry.m === 'number' ? entry.m : 0,
        startedAt: typeof entry.t === 'number' ? entry.t : 0,
        command: typeof entry.c === 'string' ? entry.c : '',
      },
    ];
  });
}

export function parsePsSample(stdout: string): ProcessSample[] {
  return stdout.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s?(.*)$/.exec(line);
    return match
      ? [
          {
            pid: Number(match[1]),
            ppid: Number(match[2]),
            bytes: Number(match[3]) * 1024,
            startedAt: 0,
            command: match[4].trim(),
          },
        ]
      : [];
  });
}

class WindowsSampler implements ProcessSampler {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private pending: {
    resolve: (list: ProcessSample[] | null) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  sample(): Promise<ProcessSample[] | null> {
    if (this.pending) return Promise.resolve(null);
    const child = this.child ?? this.spawn();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.finish(null);
        this.dispose();
      }, MEMORY_SAMPLE_TIMEOUT_MS);
      this.pending = { resolve, timer };
      child.stdin.write('\n');
    });
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    this.buffer = '';
    child?.kill();
  }

  private spawn(): ChildProcessWithoutNullStreams {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        Buffer.from(WINDOWS_SAMPLER_SCRIPT, 'utf16le').toString('base64'),
      ],
      { windowsHide: true },
    );
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.read(chunk));
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    const gone = (): void => {
      if (this.child === child) {
        this.child = null;
        this.buffer = '';
      }
      this.finish(null);
    };
    child.on('error', gone);
    child.on('exit', gone);
    this.child = child;
    return child;
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    const end = this.buffer.indexOf(MEMORY_SAMPLE_END);
    if (end < 0) return;
    const json = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end + MEMORY_SAMPLE_END.length).replace(/^\r?\n/, '');
    this.finish(parseWindowsSample(json));
  }

  private finish(list: ProcessSample[] | null): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(list);
  }
}

class PsSampler implements ProcessSampler {
  async sample(): Promise<ProcessSample[] | null> {
    const run = await runCommand(
      'ps',
      ['-A', '-o', 'pid=,ppid=,rss=,args='],
      undefined,
      MEMORY_SAMPLE_TIMEOUT_MS,
    );
    return run.ok ? parsePsSample(run.stdout) : null;
  }

  dispose(): void {
    return;
  }
}

export function defaultSampler(): ProcessSampler {
  return process.platform === 'win32' ? new WindowsSampler() : new PsSampler();
}

export class MemoryTracker implements MemoryReader {
  private usage: MemoryUsage | null = null;
  private memory: MachineMemory | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly store: AgentStateStore,
    private readonly rooms: RoomsManager,
    private readonly sampler: ProcessSampler = defaultSampler(),
    private readonly sessionsDir = path.join(os.homedir(), '.claude', CLAUDE_SESSIONS_DIR_NAME),
  ) {}

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), MEMORY_POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sampler.dispose();
  }

  forRoom(label: string): number | null {
    return this.usage ? (this.usage.rooms.get(label) ?? 0) : null;
  }

  forSession(agentId: number): number | null {
    return this.usage?.sessions.get(agentId) ?? null;
  }

  machine(): MachineMemory | null {
    return this.memory;
  }

  async refresh(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const processes = await this.sampler.sample();
      this.memory = { totalBytes: os.totalmem(), freeBytes: os.freemem() };
      this.usage = processes
        ? measureMemory(
            processes,
            readSessionProcesses(this.sessionsDir),
            this.agents(),
            this.rooms.everyRoom,
          )
        : null;
    } finally {
      this.running = false;
    }
  }

  private agents(): MemoryAgent[] {
    return [...this.store.values()].map((agent) => ({
      id: agent.id,
      sessionIds: [
        ...new Set([agent.sessionId, path.basename(agent.jsonlFile || '', '.jsonl')]),
      ].filter(Boolean),
      room: agent.directoryName ?? null,
    }));
  }
}
