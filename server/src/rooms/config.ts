import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../constants.js';
import { expandTilde } from '../directories.js';
import { ROOMS_CONFIG_FILE_NAME } from './constants.js';
import { repositoryTopLevel } from './git.js';

export interface ProjectConfig {
  name: string;
  root: string;
  include: string[];
  exclude: string[];
  includeMain: boolean;
  followToolPaths: boolean;
}

export interface RoomsConfig {
  projects: ProjectConfig[];
  source: 'file' | 'start-directory' | 'none';
}

export function roomsConfigPath(): string {
  return path.join(os.homedir(), SERVER_JSON_DIR, ROOMS_CONFIG_FILE_NAME);
}

export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [];
}

export function resolveUserPath(raw: string): string {
  return path.resolve(expandTilde(raw));
}

export function parseProject(raw: unknown): ProjectConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.root !== 'string' || !obj.root.trim()) return null;
  const root = resolveUserPath(obj.root);
  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : path.basename(root),
    root,
    include: stringList(obj.include),
    exclude: stringList(obj.exclude),
    includeMain: obj.includeMain === true,
    followToolPaths: obj.followToolPaths !== false,
  };
}

export function readRoomsConfigFile(): Record<string, unknown> | null {
  const file = roomsConfigPath();
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (err) {
    console.error(
      `[worktree-office] Ignoring ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}

export async function loadRoomsConfig(startDir: string): Promise<RoomsConfig> {
  const fromFile = readRoomsConfigFile();
  if (fromFile) {
    const projects = Array.isArray(fromFile.projects)
      ? fromFile.projects.map(parseProject).filter((p): p is ProjectConfig => p !== null)
      : [];
    return { projects, source: 'file' };
  }
  const top = await repositoryTopLevel(startDir);
  if (!top) return { projects: [], source: 'none' };
  const project = parseProject({ root: top });
  return { projects: project ? [project] : [], source: 'start-directory' };
}
