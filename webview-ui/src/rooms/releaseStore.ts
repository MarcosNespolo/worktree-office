import { useSyncExternalStore } from 'react';

import type { ReleaseResult } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

export interface ReleaseState {
  prompt: ReleaseResult | null;
  notice: ReleaseResult | null;
  busy: string | null;
}

interface Confirmations {
  confirmOpenPr: boolean;
  confirmAgents: boolean;
  confirmDirty: boolean;
}

let state: ReleaseState = { prompt: null, notice: null, busy: null };
const confirmations = new Map<string, Confirmations>();
const listeners = new Set<() => void>();

function update(patch: Partial<ReleaseState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function send(label: string): void {
  const flags = confirmations.get(label) ?? {
    confirmOpenPr: false,
    confirmAgents: false,
    confirmDirty: false,
  };
  update({ busy: label, prompt: null });
  transport.send({ type: 'releaseRoom', label, ...flags });
}

export function requestRelease(label: string): void {
  confirmations.set(label, { confirmOpenPr: false, confirmAgents: false, confirmDirty: false });
  send(label);
}

export function confirmRelease(): void {
  const prompt = state.prompt;
  if (!prompt?.needs) return;
  const flags = confirmations.get(prompt.label) ?? {
    confirmOpenPr: false,
    confirmAgents: false,
    confirmDirty: false,
  };
  if (prompt.needs === 'open-pr') flags.confirmOpenPr = true;
  if (prompt.needs === 'agents') flags.confirmAgents = true;
  if (prompt.needs === 'dirty') flags.confirmDirty = true;
  confirmations.set(prompt.label, flags);
  send(prompt.label);
}

export function cancelRelease(): void {
  update({ prompt: null, busy: null });
}

export function dismissReleaseNotice(): void {
  update({ notice: null });
}

export function receiveReleaseResult(result: ReleaseResult): void {
  if (result.needs) update({ prompt: result, busy: null });
  else update({ notice: result, prompt: null, busy: null });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReleaseState(): ReleaseState {
  return useSyncExternalStore(subscribe, () => state);
}
