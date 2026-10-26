import { useSyncExternalStore } from 'react';

import type { ReplyResult } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

export interface ReplyState {
  sending: number | null;
  result: ReplyResult | null;
}

let state: ReplyState = { sending: null, result: null };
const listeners = new Set<() => void>();

function set(next: ReplyState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReplyState(): ReplyState {
  return useSyncExternalStore(subscribe, () => state);
}

export function replyToSession(agentId: number, text: string, images: string[] = []): void {
  set({ sending: agentId, result: null });
  transport.send({ type: 'replyToSession', agentId, text, images });
}

export function receiveReplyResult(result: ReplyResult): void {
  set({ sending: null, result });
}

export function dismissReplyResult(): void {
  set({ sending: state.sending, result: null });
}
