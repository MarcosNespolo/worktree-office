import * as fs from 'fs';
import * as path from 'path';

import type { AgentRuntime } from '../agentRuntime.js';
import type { AgentStateStore } from '../agentStateStore.js';
import type { PtySession, PtySessionManager } from '../terminal/ptySessionManager.js';
import {
  launchStandaloneAgent,
  type LaunchStandaloneAgentDeps,
} from '../terminal/standaloneAgentLauncher.js';
import type { SessionActivity } from './activity.js';
import {
  REPLY_BUSY_MS,
  REPLY_START_TIMEOUT_MS,
  TASK_PROMPT_QUIET_MS,
  TASK_PROMPT_READY_FALLBACK_MS,
  TASK_READY_MIN_VISIBLE,
} from './constants.js';
import { plainText, READY, TRUST, typeInto } from './terminalText.js';
import { transcriptCwd } from './transcript.js';
import { withImages } from './uploads.js';

export interface ReplyDeps {
  store: AgentStateStore;
  runtime: AgentRuntime;
  ptyManager: PtySessionManager;
  provider: LaunchStandaloneAgentDeps['provider'];
  activity: SessionActivity;
  sendToTerminal: (agentId: number, text: string) => boolean;
}

export interface ReplyOutcome {
  ok: boolean;
  message: string;
  agentId: number;
}

type Readiness = 'ready' | 'trust' | 'closed' | 'timeout';

function waitUntilReady(session: PtySession): Promise<Readiness> {
  return new Promise((resolve) => {
    let screen = '';
    let visible = 0;
    let settled = false;
    let quiet: ReturnType<typeof setTimeout> | null = null;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let stopData: () => void = () => {};
    let stopExit: () => void = () => {};
    const finish = (result: Readiness): void => {
      if (settled) return;
      settled = true;
      if (quiet) clearTimeout(quiet);
      if (fallback) clearTimeout(fallback);
      clearTimeout(deadline);
      stopData();
      stopExit();
      resolve(result);
    };
    const deadline = setTimeout(() => finish('timeout'), REPLY_START_TIMEOUT_MS);
    const armFallback = (): void => {
      fallback = setTimeout(() => {
        if (visible >= TASK_READY_MIN_VISIBLE) finish('ready');
        else armFallback();
      }, TASK_PROMPT_READY_FALLBACK_MS);
    };
    stopData = session.onData((data) => {
      screen = `${screen}${data}`.slice(-8000);
      visible += plainText(data).length;
      const plain = plainText(screen);
      if (TRUST.test(plain)) {
        finish('trust');
        return;
      }
      if (!READY.test(plain)) return;
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(() => finish('ready'), TASK_PROMPT_QUIET_MS);
    });
    stopExit = session.onExit(() => finish('closed'));
    armFallback();
  });
}

type Continued =
  { ok: true; newId: number; session: PtySession } | { ok: false; outcome: ReplyOutcome };

function continueInTerminal(deps: ReplyDeps, agentId: number): Continued {
  const refuse = (message: string): Continued => ({
    ok: false,
    outcome: { ok: false, message, agentId },
  });
  const agent = deps.store.get(agentId);
  const transcriptPath = agent?.jsonlFile ?? '';
  if (!agent || !transcriptPath || !fs.existsSync(transcriptPath)) {
    return refuse('This session has no conversation to continue.');
  }
  const lastAt = deps.activity.lastAt(transcriptPath);
  if (agent.activeToolIds.size > 0 || (lastAt !== null && Date.now() - lastAt < REPLY_BUSY_MS)) {
    return refuse('This session is working right now. Try again when it stops.');
  }
  const cwd = transcriptCwd(transcriptPath);
  if (!cwd || !fs.existsSync(cwd)) {
    return refuse('The folder of this session no longer exists.');
  }

  const sessionId = path.basename(transcriptPath, '.jsonl');
  deps.runtime.removeAgent(agentId);
  deps.runtime.knownJsonlFiles.add(transcriptPath);
  const newId = launchStandaloneAgent(deps, {
    directoryPath: cwd,
    resume: { sessionId, transcriptPath },
  });
  const session = newId === null ? undefined : deps.ptyManager.get(newId);
  if (newId === null || !session) {
    deps.runtime.knownJsonlFiles.delete(transcriptPath);
    return refuse('Could not open a terminal for this session.');
  }
  console.log(
    `[worktree-office] Continuing session ${sessionId.slice(0, 8)} in an office terminal (agent ${newId}).`,
  );
  return { ok: true, newId, session };
}

export async function openSessionTerminal(deps: ReplyDeps, agentId: number): Promise<ReplyOutcome> {
  if (deps.ptyManager.get(agentId)) {
    return { ok: true, message: 'This session already runs in an office terminal.', agentId };
  }
  const continued = continueInTerminal(deps, agentId);
  if (!continued.ok) return continued.outcome;
  const newId = continued.newId;
  switch (await waitUntilReady(continued.session)) {
    case 'ready':
      return {
        ok: true,
        message: 'The conversation continues in an office terminal.',
        agentId: newId,
      };
    case 'trust':
      return {
        ok: true,
        message: 'Claude Code asks whether to trust the folder. Answer in the office terminal.',
        agentId: newId,
      };
    case 'closed':
      return {
        ok: false,
        message: 'Claude Code closed while opening the session.',
        agentId: newId,
      };
    case 'timeout':
      return {
        ok: true,
        message: 'The session is still opening in an office terminal.',
        agentId: newId,
      };
  }
}

export async function replyToSession(
  deps: ReplyDeps,
  agentId: number,
  reply: string,
  images: readonly string[] = [],
): Promise<ReplyOutcome> {
  if (!reply.trim()) return { ok: false, message: 'Type a reply first.', agentId };
  const text = withImages(reply, images);
  if (deps.ptyManager.get(agentId)) {
    const sent = deps.sendToTerminal(agentId, text);
    return sent
      ? { ok: true, message: 'Reply sent.', agentId }
      : { ok: false, message: 'The terminal of this session is closed.', agentId };
  }

  const continued = continueInTerminal(deps, agentId);
  if (!continued.ok) return continued.outcome;
  const { newId, session } = continued;

  switch (await waitUntilReady(session)) {
    case 'ready':
      typeInto(session, text);
      return {
        ok: true,
        message: 'The conversation continues in an office terminal, and your reply was sent.',
        agentId: newId,
      };
    case 'trust':
      return {
        ok: false,
        message:
          'Claude Code asks whether to trust the folder. Answer in the office terminal, then send your reply again.',
        agentId: newId,
      };
    case 'closed':
      return {
        ok: false,
        message: 'Claude Code closed while opening the session.',
        agentId: newId,
      };
    case 'timeout':
      return {
        ok: false,
        message: 'Claude Code did not get ready in time, so your reply was not sent.',
        agentId: newId,
      };
  }
}
