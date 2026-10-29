import * as net from 'net';

import type { AgentStateStore } from '../agentStateStore.js';
import type { FieldRule, ProjectConfig } from './config.js';
import {
  PORT_CHECK_TIMEOUT_MS,
  ROOMS_PORT_POLL_MS,
  ROOMS_PR_POLL_MS,
  ROOMS_STATE_BROADCAST_MS,
} from './constants.js';
import {
  type ChecksState,
  ghPullRequests,
  githubRepoOf,
  pullRequestFor,
  type PullRequestInfo,
  type PullRequestSource,
  type PullRequestState,
  type ReviewState,
} from './github.js';
import type { RoomsManager } from './manager.js';
import { type MachineMemory, type MemoryReader, NO_MEMORY } from './memory.js';
import { isReleasable } from './release.js';
import type { Room } from './rooms.js';

export interface RoomPullRequest {
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
  review: ReviewState;
  checks: ChecksState;
}

export interface RoomInfo {
  label: string;
  project: string;
  path: string;
  branch: string | null;
  pr: RoomPullRequest | null;
  fields: Record<string, string>;
  port: number | null;
  devUrl: string | null;
  serverUp: boolean;
  releasable: boolean;
  memoryBytes: number | null;
}

export type RoomNeedKind =
  | 'changes-requested'
  | 'checks-failing'
  | 'ready-to-merge'
  | 'stale-worktree'
  | 'dev-server'
  | 'field';

export type RoomNeedState = 'attention' | 'ready' | 'idle';

export interface RoomNeed {
  id: string;
  kind: RoomNeedKind;
  state: RoomNeedState;
  room: string;
  title: string;
  url: string | null;
  prUrl: string | null;
}

export type GithubState = 'ok' | 'unavailable' | 'off';

export interface RoomsSnapshot {
  type: 'roomsState';
  github: GithubState;
  rooms: RoomInfo[];
  needs: RoomNeed[];
  memory: MachineMemory | null;
}

export function portFor(room: Room, project: ProjectConfig | undefined): number | null {
  if (!project) return null;
  const explicit = project.devServer.ports[room.label];
  if (explicit !== undefined) return explicit;
  if (project.devServer.portBase === null) return null;
  const number = /\d+/.exec(room.label);
  return number
    ? project.devServer.portBase + project.devServer.portStep * Number(number[0])
    : null;
}

export function fieldsFor(
  pr: PullRequestInfo | null,
  rules: readonly FieldRule[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!pr || (pr.state !== 'open' && pr.state !== 'draft')) return fields;
  for (const rule of rules) {
    const sources = rule.from === 'labels' ? pr.labels : [pr.body];
    for (const text of sources) {
      const match = rule.pattern.exec(text);
      if (match) {
        fields[rule.name] = (match[1] ?? match[0]).trim();
        break;
      }
    }
  }
  return fields;
}

export function needsFor(info: RoomInfo, project: ProjectConfig | undefined): RoomNeed[] {
  const needs: RoomNeed[] = [];
  const pr = info.pr;
  const add = (
    kind: RoomNeedKind,
    state: RoomNeedState,
    title: string,
    url: string | null,
    suffix = '',
  ): void => {
    needs.push({
      id: `${kind}:${info.project}:${info.label}${pr ? `:${pr.number}` : ''}${suffix}`,
      kind,
      state,
      room: info.label,
      title,
      url,
      prUrl: pr?.url ?? null,
    });
  };
  if (pr && (pr.state === 'open' || pr.state === 'draft')) {
    if (pr.review === 'changes-requested')
      add('changes-requested', 'attention', `Changes requested on #${pr.number}`, pr.url);
    if (pr.checks === 'failing')
      add('checks-failing', 'attention', `Checks failing on #${pr.number}`, pr.url);
    if (
      pr.state === 'open' &&
      pr.review === 'approved' &&
      pr.checks !== 'failing' &&
      pr.checks !== 'pending'
    ) {
      add('ready-to-merge', 'ready', `#${pr.number} is approved and ready to merge`, pr.url);
    }
  }
  if (pr && (pr.state === 'merged' || pr.state === 'closed') && info.branch) {
    add(
      'stale-worktree',
      pr.state === 'merged' ? 'ready' : 'idle',
      `#${pr.number} was ${pr.state}, so this worktree can be released`,
      pr.url,
    );
  }
  if (!info.branch && info.serverUp && info.port !== null) {
    add(
      'dev-server',
      'idle',
      `Dev server still running on port ${info.port} in a free worktree`,
      info.devUrl,
    );
  }
  for (const rule of project?.needsYou ?? []) {
    const value = info.fields[rule.field];
    if (value && (rule.values.length === 0 || rule.values.includes(value))) {
      add(
        'field',
        rule.state ?? 'attention',
        rule.title ?? `${rule.field}: ${value}`,
        info.devUrl ?? pr?.url ?? null,
        `:${rule.field}`,
      );
    }
  }
  return needs;
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (up: boolean): void => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(PORT_CHECK_TIMEOUT_MS, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export async function isListening(port: number): Promise<boolean> {
  return (await canConnect('127.0.0.1', port)) || canConnect('::1', port);
}

export class StatusTracker {
  private readonly pullRequests = new Map<string, PullRequestInfo[]>();
  private readonly repos = new Map<string, string | null>();
  private readonly serverUp = new Map<number, boolean>();
  private readonly timers: Array<ReturnType<typeof setInterval>> = [];
  private github: GithubState = 'off';
  private lastJson = '';
  private warnedGithub = false;

  constructor(
    private readonly store: AgentStateStore,
    private readonly rooms: RoomsManager,
    private readonly projects: readonly ProjectConfig[],
    private readonly source: PullRequestSource = ghPullRequests,
    private readonly memory: MemoryReader = NO_MEMORY,
  ) {}

  async start(): Promise<void> {
    if (!this.rooms.enabled) return;
    await Promise.all([this.refreshPullRequests(), this.refreshPorts()]);
    this.publish(true);
    this.every(ROOMS_PR_POLL_MS, () => this.refreshPullRequests());
    this.every(ROOMS_PORT_POLL_MS, () => this.refreshPorts());
    this.timers.push(setInterval(() => this.publish(true), ROOMS_STATE_BROADCAST_MS));
    this.rooms.onChange((_rooms, layoutChanged) => {
      if (layoutChanged) void this.refreshPullRequests().then(() => this.publish(false));
      else this.publish(false);
    });
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
  }

  infoFor(label: string): RoomInfo | null {
    const room = this.rooms.current.find((candidate) => candidate.label === label);
    return room ? this.describe(room) : null;
  }

  async refreshNow(): Promise<void> {
    await Promise.all([this.refreshPullRequests(), this.refreshPorts()]);
    this.publish(true);
  }

  snapshot(): RoomsSnapshot {
    const rooms = this.rooms.current.map((room) => this.describe(room));
    const needs = rooms.flatMap((info) =>
      needsFor(
        info,
        this.projects.find((p) => p.name === info.project),
      ),
    );
    return { type: 'roomsState', github: this.github, rooms, needs, memory: this.memory.machine() };
  }

  private every(ms: number, task: () => Promise<void>): void {
    this.timers.push(setInterval(() => void task().then(() => this.publish(false)), ms));
  }

  private describe(room: Room): RoomInfo {
    const project = this.rooms.projectOf(room);
    const pr = pullRequestFor(room.branch, this.pullRequests.get(room.project) ?? []);
    const port = portFor(room, project);
    return {
      label: room.label,
      project: room.project,
      path: room.path,
      branch: room.branch,
      pr: pr
        ? {
            number: pr.number,
            title: pr.title,
            url: pr.url,
            state: pr.state,
            review: pr.review,
            checks: pr.checks,
          }
        : null,
      fields: fieldsFor(pr, project?.fields ?? []),
      port,
      devUrl:
        port !== null && project?.devServer.url
          ? project.devServer.url.replace('{port}', String(port))
          : null,
      serverUp: port !== null && this.serverUp.get(port) === true,
      releasable: project ? isReleasable(room, project) : false,
      memoryBytes: this.memory.forRoom(room.label),
    };
  }

  private publish(force: boolean): void {
    const snapshot = this.snapshot();
    const json = JSON.stringify(snapshot);
    if (!force && json === this.lastJson) return;
    this.lastJson = json;
    this.store.broadcast(snapshot as unknown as Record<string, unknown>);
  }

  private async refreshPullRequests(): Promise<void> {
    let withRepo = 0;
    let failed = 0;
    for (const project of this.projects) {
      if (project.github === false) continue;
      if (!this.repos.has(project.name)) {
        this.repos.set(project.name, project.github || (await githubRepoOf(project.root)));
      }
      const repo = this.repos.get(project.name);
      if (!repo) continue;
      withRepo++;
      const list = await this.source(repo, {
        body: project.fields.some((field) => field.from === 'body'),
        labels: project.fields.some((field) => field.from === 'labels'),
      });
      if (list) this.pullRequests.set(project.name, list);
      else failed++;
    }
    this.github = withRepo === 0 ? 'off' : failed === withRepo ? 'unavailable' : 'ok';
    if (this.github === 'unavailable' && !this.warnedGithub) {
      this.warnedGithub = true;
      console.warn(
        '[worktree-office] Cannot read pull requests: install the GitHub CLI and run `gh auth login`.',
      );
    }
  }

  serverUpAt(room: Room): boolean {
    const port = portFor(room, this.rooms.projectOf(room));
    return port !== null && this.serverUp.get(port) === true;
  }

  private async refreshPorts(): Promise<void> {
    const ports = new Set<number>();
    for (const room of this.rooms.everyRoom) {
      const port = portFor(room, this.rooms.projectOf(room));
      if (port !== null) ports.add(port);
    }
    await Promise.all(
      [...ports].map(async (port) => {
        this.serverUp.set(port, await isListening(port));
      }),
    );
  }
}
