import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { AgentRuntime } from '../agentRuntime.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { expandTilde } from '../directories.js';
import type { PtySession, PtySessionManager } from '../terminal/ptySessionManager.js';
import {
  launchStandaloneAgent,
  type LaunchStandaloneAgentDeps,
} from '../terminal/standaloneAgentLauncher.js';
import type { ProjectConfig, TasksConfig } from './config.js';
import {
  TASK_PREPARE_TIMEOUT_MS,
  TASK_PROMPT_QUIET_MS,
  TASK_PROMPT_READY_FALLBACK_MS,
  TASK_SUBMIT_DELAY_MS,
  TASKS_BROADCAST_MS,
} from './constants.js';
import { git } from './git.js';
import type { RoomsManager } from './manager.js';
import { type Room, samePath } from './rooms.js';
import { portFor } from './status.js';
import { splitTasks } from './taskText.js';

export type TaskStatus =
  'queued' | 'preparing' | 'starting' | 'blocked' | 'running' | 'done' | 'failed';

export interface TaskInfo {
  id: string;
  title: string;
  prompt: string;
  project: string;
  room: string | null;
  agentId: number | null;
  status: TaskStatus;
  detail: string;
}

export interface TasksSnapshot {
  type: 'tasksState';
  tasks: TaskInfo[];
  maxActive: number;
  active: number;
  splitting: boolean;
}

export interface TaskRunnerDeps {
  store: AgentStateStore;
  runtime: AgentRuntime;
  ptyManager: PtySessionManager;
  provider: LaunchStandaloneAgentDeps['provider'];
  rooms: RoomsManager;
  projects: readonly ProjectConfig[];
  config: TasksConfig;
  bypassPermissions: () => boolean;
}

const ACTIVE = new Set<TaskStatus>(['preparing', 'starting', 'blocked', 'running']);
const FINISHED_KEPT = 20;
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const PASTE_START = `${ESC}[200~`;
const PASTE_END = `${ESC}[201~`;
const ANSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^${BEL}]*${BEL}`, 'g');
const READY = /❯Try"|\?forshortcuts|bypasspermissionson|accepteditson|planmodeon/i;
const TRUST = /trustthisfolder|doyoutrust|trustthefiles|quicksafetycheck/i;

export function typeInto(session: PtySession, text: string): void {
  session.write(`${PASTE_START}${text}${PASTE_END}`);
  setTimeout(() => session.write('\r'), TASK_SUBMIT_DELAY_MS);
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function slugOf(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'task'
  );
}

function nextPath(template: string, slug: string): string {
  const withSlug = template.replace('{slug}', slug);
  if (withSlug.includes('{n}')) {
    for (let n = 1; n < 1000; n++) {
      const candidate = path.resolve(expandTilde(withSlug.replace('{n}', String(n))));
      if (!fs.existsSync(candidate)) return candidate;
    }
  }
  const resolved = path.resolve(expandTilde(withSlug));
  for (let n = 2; fs.existsSync(resolved) && n < 1000; n++) {
    const candidate = `${resolved}-${n}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  return resolved;
}

function runShell(command: string, cwd: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: TASK_PREPARE_TIMEOUT_MS, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, output: `${stdout}${stderr}`.trim() }),
    );
  });
}

async function defaultBase(root: string): Promise<string> {
  await git(['-C', root, 'fetch', '--quiet', 'origin']);
  const head = await git(['-C', root, 'rev-parse', '--abbrev-ref', 'origin/HEAD']);
  const ref = head.stdout.trim();
  return head.ok && ref && ref !== 'origin/HEAD' ? ref : 'HEAD';
}

export class TaskRunner {
  private tasks: TaskInfo[] = [];
  private splitting = false;
  private dispatching = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly deps: TaskRunnerDeps) {
    deps.store.on('agentRemoved', (id) => this.agentGone(id));
    deps.rooms.onChange(() => void this.dispatch());
    this.timer = setInterval(() => this.publish(), TASKS_BROADCAST_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  snapshot(): TasksSnapshot {
    return {
      type: 'tasksState',
      tasks: this.tasks.map((task) => ({ ...task })),
      maxActive: this.deps.config.maxActive,
      active: this.activeCount(),
      splitting: this.splitting,
    };
  }

  publish(): void {
    this.deps.store.broadcast(this.snapshot() as unknown as Record<string, unknown>);
  }

  async add(text: string): Promise<number> {
    const project = this.deps.projects[0];
    if (!project || !text.trim()) return 0;
    this.splitting = true;
    this.publish();
    let added = 0;
    try {
      const drafts = await splitTasks(text, this.deps.config.split, project.root);
      for (const draft of drafts) {
        this.tasks.push({
          id: randomUUID(),
          title: draft.title,
          prompt: draft.prompt,
          project: project.name,
          room: null,
          agentId: null,
          status: 'queued',
          detail: '',
        });
        added++;
      }
    } finally {
      this.splitting = false;
    }
    this.publish();
    await this.dispatch();
    return added;
  }

  cancel(id: string): void {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (!task || ACTIVE.has(task.status)) return;
    this.tasks = this.tasks.filter((candidate) => candidate.id !== id);
    this.publish();
  }

  send(agentId: number, text: string): boolean {
    const session = this.deps.ptyManager.get(agentId);
    if (!session || !text.trim()) return false;
    if (/^\S{1,3}$/.test(text.trim())) {
      session.write(text.trim());
      setTimeout(() => session.write('\r'), TASK_SUBMIT_DELAY_MS);
    } else {
      typeInto(session, text);
    }
    return true;
  }

  async dispatch(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      for (const task of this.tasks) {
        if (task.status !== 'queued') continue;
        if (this.activeCount() >= this.deps.config.maxActive) {
          task.detail = `Waiting: ${this.activeCount()} of ${this.deps.config.maxActive} tasks running`;
          continue;
        }
        const project = this.deps.projects.find((candidate) => candidate.name === task.project);
        if (!project) {
          this.fail(task, 'Its project is no longer configured');
          continue;
        }
        const room = this.freeRoom(project);
        if (room) this.launch(task, project, room);
        else if (project.createWorktree) await this.prepare(task, project);
        else task.detail = 'Waiting for a free worktree';
      }
    } finally {
      this.dispatching = false;
      this.publish();
    }
  }

  private activeCount(): number {
    return this.tasks.filter((task) => ACTIVE.has(task.status)).length;
  }

  private freeRoom(project: ProjectConfig): Room | null {
    const taken = new Set(
      this.tasks.filter((task) => ACTIVE.has(task.status) && task.room).map((task) => task.room),
    );
    for (const agent of this.deps.store.values()) {
      if (agent.directoryName) taken.add(agent.directoryName);
    }
    return (
      this.deps.rooms.current.find(
        (room) => room.project === project.name && room.branch === null && !taken.has(room.label),
      ) ?? null
    );
  }

  private fail(task: TaskInfo, detail: string): void {
    task.status = 'failed';
    task.detail = detail;
    this.trimFinished();
  }

  private trimFinished(): void {
    const finished = this.tasks.filter(
      (task) => task.status === 'done' || task.status === 'failed',
    );
    const excess = finished.length - FINISHED_KEPT;
    if (excess > 0) {
      const drop = new Set(finished.slice(0, excess).map((task) => task.id));
      this.tasks = this.tasks.filter((task) => !drop.has(task.id));
    }
  }

  private async prepare(task: TaskInfo, project: ProjectConfig): Promise<void> {
    const config = project.createWorktree;
    if (!config) return;
    task.status = 'preparing';
    task.detail = 'Creating a worktree';
    this.publish();
    const slug = slugOf(task.title);
    const target = nextPath(config.path, slug);
    const base = await defaultBase(project.root);
    const branch = config.branch ? fillTemplate(config.branch, { slug }) : null;
    const added = await git(
      branch
        ? ['-C', project.root, 'worktree', 'add', '-b', branch, target, base]
        : ['-C', project.root, 'worktree', 'add', '--detach', target, base],
    );
    if (!added.ok)
      return this.fail(task, `Cannot create the worktree: ${added.stderr.trim().slice(0, 300)}`);
    for (const relative of config.copy) {
      const from = path.join(project.root, relative);
      if (!fs.existsSync(from)) continue;
      fs.mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
      fs.copyFileSync(from, path.join(target, relative));
    }
    for (const command of config.after) {
      task.detail = `Preparing the worktree: ${command}`;
      this.publish();
      const run = await runShell(command, target);
      if (!run.ok) return this.fail(task, `"${command}" failed: ${run.output.slice(-300)}`);
    }
    await this.deps.rooms.refresh();
    const room = this.deps.rooms.current.find((candidate) => samePath(candidate.path, target));
    if (!room)
      return this.fail(task, 'The new worktree did not become a room. Check include and exclude.');
    this.launch(task, project, room);
  }

  private launch(task: TaskInfo, project: ProjectConfig, room: Room): void {
    task.status = 'starting';
    task.room = room.label;
    task.detail = 'Starting Claude Code';
    const agentId = launchStandaloneAgent(
      {
        store: this.deps.store,
        runtime: this.deps.runtime,
        ptyManager: this.deps.ptyManager,
        provider: this.deps.provider,
      },
      {
        directoryPath: room.path,
        bypassPermissions: project.launch.skipPermissions || this.deps.bypassPermissions(),
      },
    );
    const session = agentId === null ? undefined : this.deps.ptyManager.get(agentId);
    if (agentId === null || !session) return this.fail(task, 'Claude Code could not start');
    task.agentId = agentId;
    const port = portFor(room, project);
    const prompt = fillTemplate(project.launch.prompt, {
      text: task.prompt,
      title: task.title,
      room: room.label,
      path: room.path,
      branch: room.branch ?? '',
      port: port === null ? '' : String(port),
    });
    this.typeWhenReady(task, session, prompt);
  }

  private typeWhenReady(task: TaskInfo, session: PtySession, prompt: string): void {
    let screen = '';
    let typed = false;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let quiet: ReturnType<typeof setTimeout> | null = null;
    const clear = (): void => {
      if (fallback) clearTimeout(fallback);
      if (quiet) clearTimeout(quiet);
    };
    const armFallback = (): void => {
      if (fallback) clearTimeout(fallback);
      fallback = setTimeout(() => go(), TASK_PROMPT_READY_FALLBACK_MS);
    };
    const go = (): void => {
      if (typed || task.status === 'done' || task.status === 'failed') return;
      typed = true;
      clear();
      unsubscribe();
      typeInto(session, prompt);
      task.status = 'running';
      task.detail = '';
      this.publish();
    };
    const unsubscribe = session.onData((data) => {
      screen = `${screen}${data}`.slice(-8000);
      const plain = screen.replace(ANSI, '').replace(/\s+/g, '');
      if (TRUST.test(plain)) {
        if (task.status !== 'blocked') {
          task.status = 'blocked';
          task.detail = 'Claude Code asks whether to trust this folder. Answer in its terminal.';
          this.publish();
        }
        clear();
        screen = '';
        return;
      }
      if (task.status === 'blocked') {
        task.status = 'starting';
        task.detail = 'Starting Claude Code';
        this.publish();
        armFallback();
      }
      if (READY.test(plain)) {
        if (quiet) clearTimeout(quiet);
        quiet = setTimeout(go, TASK_PROMPT_QUIET_MS);
      }
    });
    armFallback();
  }

  private agentGone(agentId: number): void {
    const task = this.tasks.find(
      (candidate) => candidate.agentId === agentId && ACTIVE.has(candidate.status),
    );
    if (!task) return;
    task.status = 'done';
    task.detail = 'Session closed';
    this.trimFinished();
    this.publish();
    void this.dispatch();
  }
}
