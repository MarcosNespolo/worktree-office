import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentStateStore } from '../agentStateStore.js';
import { readConfig, writeConfig } from '../configPersistence.js';
import { LAYOUT_FILE_DIR } from '../constants.js';
import { listDirectories, normalizeDirectoryPath } from '../directories.js';
import { directoryNameFor, hostDirectory } from '../hostDirectory.js';
import { writeLayoutToFile } from '../layoutPersistence.js';
import type { ProjectConfig, RoomsConfig } from './config.js';
import { ROOMS_POLL_INTERVAL_MS, ROOMS_STATE_FILE_NAME } from './constants.js';
import { planRoomsLayout } from './layout.js';
import { discoverRooms, type Room, roomForPath } from './rooms.js';

interface ManagedState {
  directoryPaths: string[];
  mappingKeys: string[];
}

type RoomsListener = (rooms: readonly Room[], layoutChanged: boolean) => void;

function statePath(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, ROOMS_STATE_FILE_NAME);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function readState(): ManagedState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf-8')) as Record<string, unknown>;
    return { directoryPaths: strings(raw.directoryPaths), mappingKeys: strings(raw.mappingKeys) };
  } catch {
    return { directoryPaths: [], mappingKeys: [] };
  }
}

function writeState(state: ManagedState): void {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[worktree-office] Failed to write rooms state:', err);
  }
}

export class RoomsManager {
  private rooms: Room[] = [];
  private signature: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;
  private readonly warned = new Set<string>();
  private readonly listeners: RoomsListener[] = [];

  constructor(
    private readonly store: AgentStateStore,
    private readonly projects: readonly ProjectConfig[],
  ) {}

  get current(): readonly Room[] {
    return this.rooms;
  }

  get enabled(): boolean {
    return this.projects.length > 0;
  }

  onChange(listener: RoomsListener): void {
    this.listeners.push(listener);
  }

  async start(): Promise<void> {
    if (!this.enabled) return;
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), ROOMS_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  roomFor(filePath: string | undefined): Room | null {
    return roomForPath(this.rooms, filePath);
  }

  directoryNameFor(cwd: string | undefined): string | undefined {
    if (!cwd) return undefined;
    return this.roomFor(cwd)?.label ?? directoryNameFor(cwd);
  }

  projectOf(room: Room): ProjectConfig | undefined {
    return this.projects.find((project) => project.name === room.project);
  }

  followsToolPaths(room: Room): boolean {
    return this.projectOf(room)?.followToolPaths ?? true;
  }

  describe(source: RoomsConfig['source']): string {
    if (!this.enabled) {
      return 'No git project found: start inside a repository or list projects in ~/.worktree-office/projects.json.';
    }
    const origin = source === 'file' ? 'projects.json' : 'the start directory';
    return `${this.projects.length} project(s) from ${origin}, ${this.rooms.length} room(s).`;
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const discovery = await discoverRooms(this.projects, this.rooms);
      for (const project of discovery.failedProjects)
        this.warnOnce(
          `git:${project}`,
          `Cannot list worktrees of ${project}; keeping its last known rooms.`,
        );
      if (discovery.truncated > 0) {
        this.warnOnce(
          `max:${discovery.truncated}`,
          `${discovery.truncated} worktree(s) left out: the office holds ${discovery.rooms.length} rooms at most.`,
        );
      }
      const signature = JSON.stringify(discovery.rooms.map((room) => [room.label, room.path]));
      this.rooms = discovery.rooms;
      const layoutChanged = signature !== this.signature;
      if (layoutChanged) {
        this.signature = signature;
        this.apply();
      }
      for (const listener of this.listeners) listener(this.rooms, layoutChanged);
    } catch (err) {
      console.error('[worktree-office] Rooms refresh failed:', err);
    } finally {
      this.refreshing = false;
    }
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[worktree-office] ${message}`);
  }

  private apply(): void {
    const mappings = this.syncDirectoriesAndAreas();
    this.store.broadcast({ type: 'areaMappingsLoaded', mappings });
    this.store.broadcast({ type: 'directoriesLoaded', directories: this.shownDirectories() });
    const { layout } = planRoomsLayout(this.rooms.map((room) => room.label));
    writeLayoutToFile(layout as unknown as Record<string, unknown>);
    this.store.broadcast({ type: 'layoutLoaded', layout });
  }

  private shownDirectories(): ReturnType<typeof listDirectories> {
    const showHost = readConfig().standalone.showHostDirectories;
    return listDirectories(showHost ? [hostDirectory()] : []);
  }

  private syncDirectoriesAndAreas(): Record<string, string[]> {
    const config = readConfig();
    const state = readState();
    const managed = new Set(state.directoryPaths);
    const roomKeys = new Set(this.rooms.map((room) => normalizeDirectoryPath(room.path)));

    config.directories = config.directories.filter((dir) => {
      const key = normalizeDirectoryPath(dir.path);
      return roomKeys.has(key) || !managed.has(key);
    });

    const nextManaged: string[] = [];
    const labelByName = new Map<string, string>();
    for (const room of this.rooms) {
      const key = normalizeDirectoryPath(room.path);
      const existing = config.directories.find((dir) => normalizeDirectoryPath(dir.path) === key);
      if (!existing) {
        config.directories.push({ name: room.label, path: room.path });
        nextManaged.push(key);
      } else if (managed.has(key)) {
        existing.name = room.label;
        nextManaged.push(key);
      } else {
        labelByName.set(existing.name, room.label);
      }
      labelByName.set(room.label, room.label);
    }

    const mappings: Record<string, string[]> = { ...config.standalone.areaMappings };
    for (const key of state.mappingKeys) delete mappings[key];
    for (const [name, label] of labelByName) mappings[name] = [label];
    config.standalone.areaMappings = mappings;

    writeConfig(config);
    writeState({ directoryPaths: nextManaged, mappingKeys: [...labelByName.keys()] });
    return mappings;
  }
}
