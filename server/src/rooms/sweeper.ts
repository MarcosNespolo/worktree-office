import * as fs from 'fs';
import * as path from 'path';

import type { AgentRuntime } from '../agentRuntime.js';
import type { AgentStateStore } from '../agentStateStore.js';
import type { SessionActivity } from './activity.js';
import { SESSION_SWEEP_INTERVAL_MS } from './constants.js';

export interface SessionSweeperDeps {
  store: AgentStateStore;
  runtime: AgentRuntime;
  activity: SessionActivity;
  idleMs: number;
}

function idleFor(at: number, now: number): string {
  const minutes = Math.max(1, Math.round((now - at) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)} days`;
}

export class SessionSweeper {
  private readonly firstSeen = new Map<number, number>();
  private readonly swept = new Map<string, number>();
  private readonly timer: ReturnType<typeof setInterval> | null;

  constructor(private readonly deps: SessionSweeperDeps) {
    this.timer =
      deps.idleMs > 0 ? setInterval(() => this.sweep(), SESSION_SWEEP_INTERVAL_MS) : null;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  sweep(now = Date.now()): void {
    const { store, activity, idleMs } = this.deps;
    const live = new Set<number>();
    const idle: number[] = [];
    for (const agent of store.values()) {
      live.add(agent.id);
      if (!this.firstSeen.has(agent.id)) this.firstSeen.set(agent.id, now);
      if (!agent.isExternal || !agent.jsonlFile || agent.leadAgentId !== undefined) continue;
      if (agent.activeToolIds.size > 0) continue;
      const since = activity.lastAt(agent.jsonlFile) ?? this.firstSeen.get(agent.id) ?? now;
      if (now - since >= idleMs) idle.push(agent.id);
    }
    for (const id of [...this.firstSeen.keys()]) {
      if (!live.has(id)) this.firstSeen.delete(id);
    }
    for (const id of idle) this.remove(id, now);
    this.releaseResumed();
  }

  private remove(id: number, now: number): void {
    const { store, runtime, activity } = this.deps;
    const agent = store.get(id);
    if (!agent) return;
    const file = agent.jsonlFile;
    const lastAt = activity.lastAt(file);
    console.log(
      `[worktree-office] ${agent.directoryName ?? path.basename(file)}: no conversation for ${
        lastAt === null ? 'a while' : idleFor(lastAt, now)
      }, leaving the office until it continues.`,
    );
    runtime.removeTeammates(id);
    runtime.subagentWatch.removeByLead(id);
    runtime.removeAgent(id);
    runtime.knownJsonlFiles.add(file);
    this.swept.set(file, lastAt ?? 0);
  }

  private releaseResumed(): void {
    const { runtime, activity } = this.deps;
    for (const [file, lastAt] of [...this.swept]) {
      if (!fs.existsSync(file)) {
        this.swept.delete(file);
        runtime.knownJsonlFiles.delete(file);
        continue;
      }
      const current = activity.lastAt(file);
      if (current !== null && current > lastAt) {
        this.swept.delete(file);
        runtime.knownJsonlFiles.delete(file);
      }
    }
  }
}
