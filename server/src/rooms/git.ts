import { execFile } from 'child_process';
import * as path from 'path';

import { ROOMS_GIT_TIMEOUT_MS } from './constants.js';

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function runCommand(
  file: string,
  args: readonly string[],
  cwd?: string,
  timeoutMs: number = ROOMS_GIT_TIMEOUT_MS,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      },
    );
  });
}

export function git(args: readonly string[], cwd?: string): Promise<CommandResult> {
  return runCommand('git', args, cwd);
}

export interface WorktreeEntry {
  path: string;
  head: string | null;
  branch: string | null;
  bare: boolean;
  prunable: boolean;
}

export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = {
        path: path.resolve(line.slice('worktree '.length)),
        head: null,
        branch: null,
        bare: false,
        prunable: false,
      };
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

export async function listWorktrees(root: string): Promise<WorktreeEntry[] | null> {
  const result = await git(['-C', root, 'worktree', 'list', '--porcelain']);
  return result.ok ? parseWorktreeList(result.stdout) : null;
}

export async function repositoryTopLevel(dir: string): Promise<string | null> {
  const result = await git(['-C', dir, 'rev-parse', '--show-toplevel']);
  const top = result.stdout.trim();
  return result.ok && top ? path.resolve(top) : null;
}
