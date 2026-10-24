import * as path from 'path';

import type { ProjectConfig } from './config.js';
import { ROOMS_MAX } from './constants.js';
import { listWorktrees, type WorktreeEntry } from './git.js';
import { globToRegExp, matchesAny } from './glob.js';

export interface Room {
  label: string;
  project: string;
  path: string;
  branch: string | null;
  head: string | null;
}

export interface Discovery {
  rooms: Room[];
  failedProjects: string[];
  truncated: number;
}

const fold = (s: string): string => (process.platform === 'win32' ? s.toLowerCase() : s);

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function samePath(a: string, b: string): boolean {
  return fold(path.resolve(a)) === fold(path.resolve(b));
}

export function isInside(child: string, parent: string): boolean {
  const c = fold(path.resolve(child));
  const p = fold(path.resolve(parent));
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

export function roomLabelFor(worktreePath: string, root: string): string {
  const base = path.basename(worktreePath);
  const prefix = `${path.basename(root)}-`;
  if (base.toLowerCase().startsWith(prefix.toLowerCase())) {
    const rest = base.slice(prefix.length);
    if (/[a-z]/i.test(rest)) return rest;
  }
  return base;
}

function projectRooms(project: ProjectConfig, entries: readonly WorktreeEntry[]): Room[] {
  const include = project.include.map(globToRegExp);
  const exclude = project.exclude.map(globToRegExp);
  return entries
    .filter((entry, index) => !entry.bare && !entry.prunable && (project.includeMain || index > 0))
    .filter((entry) => include.length === 0 || matchesAny(entry.path, include))
    .filter((entry) => !matchesAny(entry.path, exclude))
    .map((entry) => ({
      label: roomLabelFor(entry.path, project.root),
      project: project.name,
      path: entry.path,
      branch: entry.branch,
      head: entry.head,
    }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

function uniqueLabel(room: Room, used: Set<string>): string {
  const candidates = [room.label, `${room.label}@${room.project}`];
  for (let n = 2; candidates.length < 50; n++)
    candidates.push(`${room.label}@${room.project}-${n}`);
  return candidates.find((label) => !used.has(label.toLowerCase())) ?? room.path;
}

export async function discoverRooms(
  projects: readonly ProjectConfig[],
  previous: readonly Room[],
): Promise<Discovery> {
  const rooms: Room[] = [];
  const failedProjects: string[] = [];
  const used = new Set<string>();
  for (const project of projects) {
    const entries = await listWorktrees(project.root);
    const found = entries
      ? projectRooms(project, entries)
      : previous.filter((room) => room.project === project.name);
    if (!entries) failedProjects.push(project.name);
    for (const room of found) {
      const label = entries ? uniqueLabel(room, used) : room.label;
      used.add(label.toLowerCase());
      rooms.push({ ...room, label });
    }
  }
  return {
    rooms: rooms.slice(0, ROOMS_MAX),
    failedProjects,
    truncated: Math.max(0, rooms.length - ROOMS_MAX),
  };
}

export function roomForPath(rooms: readonly Room[], filePath: string | undefined): Room | null {
  if (!filePath) return null;
  let best: Room | null = null;
  for (const room of rooms) {
    if (isInside(filePath, room.path) && (!best || room.path.length > best.path.length)) {
      best = room;
    }
  }
  return best;
}
