import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentStateStore } from '../agentStateStore.js';
import type { DiskConfig } from './config.js';
import {
  DISK_BUILD_FOLDERS,
  DISK_DRIVES_POLL_MS,
  DISK_FIRST_SCAN_DELAY_MS,
  DISK_SCAN_INTERVAL_MS,
  DISK_SCAN_TIMEOUT_MS,
} from './constants.js';
import type { RoomsManager } from './manager.js';
import { isInside, samePath } from './rooms.js';

export interface DiskJob {
  path: string;
  skip: string[];
}

export type FolderSizes = [other: number, modules: number, build: number, git: number];

export interface DiskScanner {
  run(jobs: readonly DiskJob[]): Promise<Array<FolderSizes | null>>;
  cancel(): void;
}

export interface DriveSpace {
  root: string;
  totalBytes: number;
  freeBytes: number;
}

export interface WorktreeDisk {
  label: string;
  project: string;
  path: string;
  totalBytes: number;
  modulesBytes: number;
  buildBytes: number;
  gitBytes: number;
  measuredAt: number;
}

export interface FolderDisk {
  label: string;
  path: string;
  bytes: number | null;
  measuredAt: number;
}

export interface DiskSnapshot {
  type: 'diskState';
  scanning: boolean;
  measuredAt: number | null;
  drives: DriveSpace[];
  worktrees: WorktreeDisk[];
  folders: FolderDisk[];
}

const OTHER = 0;
const MODULES = 1;
const BUILD = 2;
const GIT = 3;

const WINDOWS_SCAN_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false',
  "$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__REQUEST__')) | ConvertFrom-Json",
  "$builds = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)",
  'foreach ($name in $request.build) { [void]$builds.Add($name) }',
  'for ($id = 0; $id -lt $request.jobs.Count; $id++) {',
  '  $job = $request.jobs[$id]',
  '  $root = New-Object System.IO.DirectoryInfo $job.path',
  '  if (-not $root.Exists) { continue }',
  "  $skip = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)",
  '  foreach ($folder in $job.skip) { [void]$skip.Add($folder) }',
  "  $sizes = New-Object 'long[]' 4",
  "  $dirs = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'",
  "  $kinds = New-Object 'System.Collections.Generic.Stack[int]'",
  '  $dirs.Push($root)',
  '  $kinds.Push(0)',
  '  while ($dirs.Count -gt 0) {',
  '    $dir = $dirs.Pop()',
  '    $kind = $kinds.Pop()',
  '    try {',
  '      foreach ($entry in $dir.EnumerateFileSystemInfos()) {',
  '        $attributes = $entry.Attributes',
  '        if ($attributes -band [IO.FileAttributes]::ReparsePoint) { continue }',
  '        if ($attributes -band [IO.FileAttributes]::Directory) {',
  '          if ($skip.Contains($entry.FullName)) { continue }',
  '          $child = $kind',
  '          if ($kind -eq 0) {',
  "            if ($entry.Name -eq 'node_modules') { $child = 1 }",
  '            elseif ($builds.Contains($entry.Name)) { $child = 2 }',
  "            elseif ($entry.Name -eq '.git') { $child = 3 }",
  '          }',
  '          $dirs.Push($entry)',
  '          $kinds.Push($child)',
  '        } else {',
  '          $sizes[$kind] += $entry.Length',
  '        }',
  '      }',
  '    } catch { }',
  '  }',
  '  [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{ id = $id; sizes = @($sizes[0], $sizes[1], $sizes[2], $sizes[3]) }))',
  '  [Console]::Out.Flush()',
  '}',
].join('\n');

function kindOf(name: string, kind: number, builds: ReadonlySet<string>): number {
  if (kind !== OTHER) return kind;
  if (name === 'node_modules') return MODULES;
  if (builds.has(name)) return BUILD;
  return name === '.git' ? GIT : OTHER;
}

async function walkFolder(job: DiskJob, builds: ReadonlySet<string>): Promise<FolderSizes | null> {
  try {
    if (!(await fs.promises.stat(job.path)).isDirectory()) return null;
  } catch {
    return null;
  }
  const sizes: FolderSizes = [0, 0, 0, 0];
  const skip = new Set(job.skip);
  const stack: Array<[string, number]> = [[job.path, OTHER]];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const [dir, kind] = next;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !skip.has(full)) {
        stack.push([full, kindOf(entry.name, kind, builds)]);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
    const lengths = await Promise.all(
      files.map((file) =>
        fs.promises.lstat(file).then(
          (stat) => stat.size,
          () => 0,
        ),
      ),
    );
    for (const length of lengths) sizes[kind] += length;
  }
  return sizes;
}

class NodeDiskScanner implements DiskScanner {
  async run(jobs: readonly DiskJob[]): Promise<Array<FolderSizes | null>> {
    const builds = new Set(DISK_BUILD_FOLDERS);
    const results: Array<FolderSizes | null> = [];
    for (const job of jobs) results.push(await walkFolder(job, builds));
    return results;
  }

  cancel(): void {
    return;
  }
}

export function parseScanLines(output: string, count: number): Array<FolderSizes | null> {
  const results: Array<FolderSizes | null> = new Array<FolderSizes | null>(count).fill(null);
  for (const line of output.split(/\r?\n/)) {
    let record: { id?: unknown; sizes?: unknown };
    try {
      record = JSON.parse(line.replace(/^\uFEFF/, '')) as typeof record;
    } catch {
      continue;
    }
    const sizes = record.sizes;
    if (
      typeof record.id === 'number' &&
      record.id >= 0 &&
      record.id < count &&
      Array.isArray(sizes) &&
      sizes.length === 4 &&
      sizes.every((size) => typeof size === 'number')
    ) {
      results[record.id] = sizes as FolderSizes;
    }
  }
  return results;
}

class WindowsDiskScanner implements DiskScanner {
  private child: ChildProcess | null = null;

  run(jobs: readonly DiskJob[]): Promise<Array<FolderSizes | null>> {
    const request = Buffer.from(
      JSON.stringify({ build: DISK_BUILD_FOLDERS, jobs }),
      'utf8',
    ).toString('base64');
    const script = WINDOWS_SCAN_SCRIPT.replace('__REQUEST__', request);
    return new Promise((resolve) => {
      let output = '';
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          Buffer.from(script, 'utf16le').toString('base64'),
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      this.child = child;
      const timer = setTimeout(() => child.kill(), DISK_SCAN_TIMEOUT_MS);
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        output += chunk;
      });
      const done = (): void => {
        clearTimeout(timer);
        if (this.child === child) this.child = null;
        resolve(parseScanLines(output, jobs.length));
      };
      child.on('error', done);
      child.on('close', done);
    });
  }

  cancel(): void {
    this.child?.kill();
    this.child = null;
  }
}

export function defaultDiskScanner(): DiskScanner {
  return process.platform === 'win32' ? new WindowsDiskScanner() : new NodeDiskScanner();
}

function totalOf(sizes: FolderSizes): number {
  return sizes[OTHER] + sizes[MODULES] + sizes[BUILD] + sizes[GIT];
}

export class DiskTracker {
  private worktrees: WorktreeDisk[] = [];
  private folders: FolderDisk[] = [];
  private drives: DriveSpace[] = [];
  private scanning = false;
  private measuredAt: number | null = null;
  private lastJson = '';
  private readonly timers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private readonly store: AgentStateStore,
    private readonly rooms: RoomsManager,
    private readonly config: DiskConfig,
    private readonly scanner: DiskScanner = defaultDiskScanner(),
  ) {}

  start(): void {
    void this.refreshDrives();
    this.timers.push(setInterval(() => void this.refreshDrives(), DISK_DRIVES_POLL_MS));
    this.timers.push(setTimeout(() => void this.measure(), DISK_FIRST_SCAN_DELAY_MS));
    this.timers.push(setInterval(() => void this.measure(), DISK_SCAN_INTERVAL_MS));
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.length = 0;
    this.scanner.cancel();
  }

  measureNow(): void {
    void this.measure();
  }

  snapshot(): DiskSnapshot {
    return {
      type: 'diskState',
      scanning: this.scanning,
      measuredAt: this.measuredAt,
      drives: this.drives,
      worktrees: this.worktrees,
      folders: this.folders,
    };
  }

  async measure(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    this.publish();
    try {
      const rooms = [...this.rooms.everyRoom];
      const jobs: DiskJob[] = [
        ...rooms.map((room) => ({
          path: room.path,
          skip: rooms
            .filter((other) => !samePath(other.path, room.path) && isInside(other.path, room.path))
            .map((other) => path.resolve(other.path)),
        })),
        ...this.config.folders.map((folder) => ({ path: folder.path, skip: [] })),
      ];
      const results = await this.scanner.run(jobs);
      const at = Date.now();
      const previous = new Map(this.worktrees.map((entry) => [entry.label, entry]));
      this.worktrees = rooms
        .flatMap((room, index): WorktreeDisk[] => {
          const sizes = results[index];
          if (!sizes) {
            const kept = previous.get(room.label);
            return kept && samePath(kept.path, room.path) ? [kept] : [];
          }
          return [
            {
              label: room.label,
              project: room.project,
              path: room.path,
              totalBytes: totalOf(sizes),
              modulesBytes: sizes[MODULES],
              buildBytes: sizes[BUILD],
              gitBytes: sizes[GIT],
              measuredAt: at,
            },
          ];
        })
        .sort((a, b) => b.totalBytes - a.totalBytes);
      this.folders = this.config.folders.map((folder, index) => {
        const sizes = results[rooms.length + index];
        return {
          label: folder.label,
          path: folder.path,
          bytes: sizes ? totalOf(sizes) : null,
          measuredAt: at,
        };
      });
      this.measuredAt = at;
    } finally {
      this.scanning = false;
      await this.refreshDrives();
    }
  }

  private async refreshDrives(): Promise<void> {
    const places = [
      os.homedir(),
      ...this.rooms.everyRoom.map((room) => room.path),
      ...this.config.folders.map((folder) => folder.path),
    ];
    const roots = [...new Set(places.map((place) => path.parse(path.resolve(place)).root))].sort();
    const drives: DriveSpace[] = [];
    for (const root of roots) {
      try {
        const stat = await fs.promises.statfs(root);
        drives.push({
          root,
          totalBytes: stat.blocks * stat.bsize,
          freeBytes: stat.bavail * stat.bsize,
        });
      } catch {
        continue;
      }
    }
    this.drives = drives;
    this.publish();
  }

  private publish(): void {
    const snapshot = this.snapshot();
    const json = JSON.stringify(snapshot);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.store.broadcast(snapshot as unknown as Record<string, unknown>);
  }
}
