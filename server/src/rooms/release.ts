import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentStateStore } from '../agentStateStore.js';
import { LAYOUT_FILE_DIR } from '../constants.js';
import {
  RELEASE_COMMAND_TIMEOUT_MS,
  RELEASE_LOG_FILE_NAME,
  RELEASE_MAX_LISTED_FILES,
  RELEASE_REMOVE_TIMEOUT_MS,
} from './constants.js';
import { git, runCommand } from './git.js';
import { globToRegExp, matchesAny } from './glob.js';
import type { RoomsManager } from './manager.js';
import { samePath } from './rooms.js';
import type { StatusTracker } from './status.js';

export type ReleaseNeed = 'open-pr' | 'agents' | 'dirty';

export interface ReleaseRequest {
  label: string;
  confirmOpenPr: boolean;
  confirmAgents: boolean;
  confirmDirty: boolean;
}

export interface ReleaseResult {
  type: 'releaseResult';
  label: string;
  ok: boolean;
  needs: ReleaseNeed | null;
  message: string;
  files: string[];
}

export interface ReleaseDeps {
  store: AgentStateStore;
  rooms: RoomsManager;
  status: StatusTracker;
  hasTerminal: (agentId: number) => boolean;
  closeAgent: (agentId: number) => void;
}

export function parseReleaseRequest(msg: Record<string, unknown>): ReleaseRequest | null {
  if (typeof msg.label !== 'string' || !msg.label) return null;
  return {
    label: msg.label,
    confirmOpenPr: msg.confirmOpenPr === true,
    confirmAgents: msg.confirmAgents === true,
    confirmDirty: msg.confirmDirty === true,
  };
}

function result(
  label: string,
  ok: boolean,
  message: string,
  needs: ReleaseNeed | null = null,
  files: string[] = [],
): ReleaseResult {
  return { type: 'releaseResult', label, ok, needs, message, files };
}

function runShell(command: string, cwd: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: RELEASE_COMMAND_TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: `${stdout}${stderr}`.trim() });
      },
    );
  });
}

async function listeningPids(port: number): Promise<number[]> {
  if (process.platform === 'win32') {
    const netstat = await runCommand('netstat', ['-ano', '-p', 'TCP']);
    const pids = new Set<number>();
    for (const line of netstat.stdout.split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 5 || columns[0] !== 'TCP') continue;
      const local = columns[1];
      const remote = columns[2];
      const pid = Number(columns[columns.length - 1]);
      const listening = remote === '0.0.0.0:0' || remote === '[::]:0';
      if (listening && local.endsWith(`:${port}`) && pid > 4) pids.add(pid);
    }
    return [...pids];
  }
  const lsof = await runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return lsof.stdout
    .split(/\s+/)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 1);
}

async function stopPort(port: number): Promise<number[]> {
  const pids = (await listeningPids(port)).filter((pid) => pid !== process.pid);
  for (const pid of pids) {
    if (process.platform === 'win32') {
      await runCommand('taskkill', ['/PID', String(pid), '/T', '/F']);
    } else {
      await runCommand('pkill', ['-TERM', '-P', String(pid)]);
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        continue;
      }
    }
  }
  return pids;
}

async function detachToDefault(worktree: string): Promise<string | null> {
  await git(['-C', worktree, 'fetch', '--quiet', 'origin']);
  const head = await git(['-C', worktree, 'rev-parse', '--abbrev-ref', 'origin/HEAD']);
  const candidates = [
    head.ok ? head.stdout.trim() : '',
    'origin/main',
    'origin/master',
    'main',
    'master',
  ];
  for (const ref of candidates.filter((candidate) => candidate && candidate !== 'origin/HEAD')) {
    const checkout = await git(['-C', worktree, 'checkout', '--quiet', '--detach', ref]);
    if (checkout.ok) return ref;
  }
  return null;
}

function logRelease(line: string): void {
  try {
    const file = path.join(os.homedir(), LAYOUT_FILE_DIR, RELEASE_LOG_FILE_NAME);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf-8');
  } catch {
    return;
  }
}

export async function releaseRoom(
  deps: ReleaseDeps,
  request: ReleaseRequest,
): Promise<ReleaseResult> {
  const room = deps.rooms.current.find((candidate) => candidate.label === request.label);
  if (!room) return result(request.label, false, `There is no room called ${request.label}.`);
  const project = deps.rooms.projectOf(room);
  if (!project) return result(room.label, false, `Room ${room.label} has no project.`);
  if (samePath(room.path, project.root)) {
    return result(room.label, false, 'The main checkout is never released.');
  }

  const info = deps.status.infoFor(room.label);
  const pr = info?.pr;
  if (pr && (pr.state === 'open' || pr.state === 'draft') && !request.confirmOpenPr) {
    return result(
      room.label,
      false,
      `Pull request #${pr.number} is still ${pr.state}. Release ${room.label} anyway?`,
      'open-pr',
    );
  }

  const launched = [...deps.store.values()].filter(
    (agent) => agent.directoryName === room.label && deps.hasTerminal(agent.id),
  );
  if (launched.length > 0 && !request.confirmAgents) {
    return result(
      room.label,
      false,
      `${launched.length} session(s) started here from the office will be closed.`,
      'agents',
    );
  }

  for (const command of project.release.before) {
    const run = await runShell(command, room.path);
    if (!run.ok) {
      return result(
        room.label,
        false,
        `"${command}" failed in ${room.label}: ${run.output.slice(0, 300)}`,
      );
    }
  }

  const status = await git(['-C', room.path, 'status', '--porcelain']);
  if (!status.ok) return result(room.label, false, `Cannot read the status of ${room.label}.`);
  const changed = status.stdout
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.slice(3));
  if (changed.length > 0 && !request.confirmDirty) {
    return result(
      room.label,
      false,
      `${changed.length} changed file(s) will be stashed before releasing ${room.label}.`,
      'dirty',
      changed.slice(0, RELEASE_MAX_LISTED_FILES),
    );
  }

  for (const agent of launched) deps.closeAgent(agent.id);

  const steps: string[] = [];
  if (changed.length > 0) {
    const stash = await git([
      '-C',
      room.path,
      'stash',
      'push',
      '--include-untracked',
      '-m',
      `worktree-office release ${room.label} ${room.branch ?? 'detached'} ${new Date().toISOString()}`,
    ]);
    if (!stash.ok)
      return result(room.label, false, `Stash failed: ${stash.stderr.trim().slice(0, 300)}`);
    steps.push(`stashed ${changed.length} file(s)`);
  }

  if (info?.port !== null && info?.port !== undefined) {
    const stopped = await stopPort(info.port);
    if (stopped.length > 0) steps.push(`stopped the dev server on port ${info.port}`);
  }

  const kept = matchesAny(room.path, project.release.keep.map(globToRegExp));
  if (project.release.mode === 'remove' && !kept) {
    const removed = await runCommand(
      'git',
      ['-C', project.root, 'worktree', 'remove', room.path],
      project.root,
      RELEASE_REMOVE_TIMEOUT_MS,
    );
    if (!removed.ok)
      return result(
        room.label,
        false,
        `Cannot remove the worktree: ${removed.stderr.trim().slice(0, 300)}`,
      );
    steps.push('removed the worktree');
  } else {
    const ref = await detachToDefault(room.path);
    if (!ref)
      return result(room.label, false, `Cannot check out the default branch in ${room.label}.`);
    steps.push(`detached at ${ref}`);
  }

  const message = `Released ${room.label}: ${steps.join(', ')}.`;
  logRelease(message);
  await deps.rooms.refresh();
  await deps.status.refreshNow();
  return result(room.label, true, message);
}
