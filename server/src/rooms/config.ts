import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../constants.js';
import { expandTilde } from '../directories.js';
import { ROOMS_CONFIG_FILE_NAME } from './constants.js';
import { repositoryTopLevel } from './git.js';

export interface DevServerConfig {
  portBase: number | null;
  portStep: number;
  ports: Record<string, number>;
  url: string | null;
}

export interface FieldRule {
  name: string;
  pattern: RegExp;
  from: 'body' | 'labels';
}

export interface NeedRule {
  field: string;
  values: string[];
  title: string | null;
}

export interface ReleaseConfig {
  mode: 'detach' | 'remove';
  before: string[];
}

export interface LaunchConfig {
  prompt: string;
  skipPermissions: boolean;
  rooms: string[];
}

export interface CreateWorktreeConfig {
  path: string;
  branch: string | null;
  copy: string[];
  after: string[];
}

export interface ProjectConfig {
  name: string;
  root: string;
  include: string[];
  exclude: string[];
  includeMain: boolean;
  followToolPaths: boolean;
  github: string | false | null;
  devServer: DevServerConfig;
  fields: FieldRule[];
  needsYou: NeedRule[];
  release: ReleaseConfig;
  launch: LaunchConfig;
  createWorktree: CreateWorktreeConfig | null;
}

export interface TasksConfig {
  maxActive: number;
  split: 'lines' | 'claude';
}

export interface RoomsConfig {
  projects: ProjectConfig[];
  source: 'file' | 'start-directory' | 'none';
  tasks: TasksConfig;
}

const DEFAULT_TASKS: TasksConfig = { maxActive: 3, split: 'lines' };

function parseTasks(raw: unknown): TasksConfig {
  const obj = objectOf(raw);
  const maxActive = integerOr(obj.maxActive, DEFAULT_TASKS.maxActive);
  return {
    maxActive: Math.max(1, maxActive),
    split: obj.split === 'claude' ? 'claude' : 'lines',
  };
}

function parseCreateWorktree(raw: unknown): CreateWorktreeConfig | null {
  const obj = objectOf(raw);
  if (typeof obj.path !== 'string' || !obj.path.trim()) return null;
  return {
    path: obj.path.trim(),
    branch: typeof obj.branch === 'string' && obj.branch.trim() ? obj.branch.trim() : null,
    copy: stringList(obj.copy),
    after: stringList(obj.after),
  };
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

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integerOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function parseDevServer(raw: unknown): DevServerConfig {
  const obj = objectOf(raw);
  const ports: Record<string, number> = {};
  for (const [label, port] of Object.entries(objectOf(obj.ports))) {
    if (typeof port === 'number' && Number.isInteger(port)) ports[label] = port;
  }
  return {
    portBase: integerOr(obj.portBase, null),
    portStep: integerOr(obj.portStep, 1),
    ports,
    url: typeof obj.url === 'string' && obj.url.trim() ? obj.url.trim() : null,
  };
}

function parseFields(raw: unknown, project: string): FieldRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: FieldRule[] = [];
  for (const item of raw) {
    const obj = objectOf(item);
    if (typeof obj.name !== 'string' || typeof obj.pattern !== 'string') continue;
    try {
      rules.push({
        name: obj.name,
        pattern: new RegExp(obj.pattern, 'm'),
        from: obj.from === 'labels' ? 'labels' : 'body',
      });
    } catch (err) {
      console.warn(
        `[worktree-office] ${project}: ignoring field "${obj.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return rules;
}

function parseNeeds(raw: unknown): NeedRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(objectOf)
    .filter((obj) => typeof obj.field === 'string')
    .map((obj) => ({
      field: obj.field as string,
      values: stringList(obj.values),
      title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : null,
    }));
}

export function parseProject(raw: unknown): ProjectConfig | null {
  const obj = objectOf(raw);
  if (typeof obj.root !== 'string' || !obj.root.trim()) return null;
  const root = resolveUserPath(obj.root);
  const name =
    typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : path.basename(root);
  return {
    name,
    root,
    include: stringList(obj.include),
    exclude: stringList(obj.exclude),
    includeMain: obj.includeMain === true,
    followToolPaths: obj.followToolPaths !== false,
    github: obj.github === false ? false : typeof obj.github === 'string' ? obj.github : null,
    devServer: parseDevServer(obj.devServer),
    fields: parseFields(obj.fields, name),
    needsYou: parseNeeds(obj.needsYou),
    release: {
      mode: objectOf(obj.release).mode === 'remove' ? 'remove' : 'detach',
      before: stringList(objectOf(obj.release).before),
    },
    launch: {
      prompt:
        typeof objectOf(obj.launch).prompt === 'string' &&
        String(objectOf(obj.launch).prompt).trim()
          ? String(objectOf(obj.launch).prompt)
          : '{text}',
      skipPermissions: objectOf(obj.launch).skipPermissions === true,
      rooms: stringList(objectOf(obj.launch).rooms),
    },
    createWorktree: parseCreateWorktree(obj.createWorktree),
  };
}

export function readRoomsConfigFile(): Record<string, unknown> | null {
  const file = roomsConfigPath();
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    return objectOf(parsed);
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
    return { projects, source: 'file', tasks: parseTasks(fromFile.tasks) };
  }
  const top = await repositoryTopLevel(startDir);
  if (!top) return { projects: [], source: 'none', tasks: DEFAULT_TASKS };
  const project = parseProject({ root: top });
  return {
    projects: project ? [project] : [],
    source: 'start-directory',
    tasks: DEFAULT_TASKS,
  };
}
