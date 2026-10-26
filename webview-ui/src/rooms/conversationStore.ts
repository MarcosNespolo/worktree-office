import { useSyncExternalStore } from 'react';

import type { ConversationMessage, SessionMessages } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

export interface ConversationState {
  agentId: number | null;
  messages: ConversationMessage[];
  truncated: boolean;
  loading: boolean;
  loadedAt: number | null;
}

const CLOSED: ConversationState = {
  agentId: null,
  messages: [],
  truncated: false,
  loading: false,
  loadedAt: null,
};

let state: ConversationState = CLOSED;
const listeners = new Set<() => void>();

function set(next: ConversationState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConversation(): ConversationState {
  return useSyncExternalStore(subscribe, () => state);
}

export function openConversation(agentId: number): void {
  const same = state.agentId === agentId;
  set({ ...(same ? state : CLOSED), agentId, loading: true });
  transport.send({ type: 'getSessionMessages', agentId });
}

export function refreshConversation(): void {
  if (state.agentId === null) return;
  transport.send({ type: 'getSessionMessages', agentId: state.agentId });
}

export function closeConversation(): void {
  set(CLOSED);
}

export function receiveSessionMessages(msg: SessionMessages): void {
  if (msg.agentId !== state.agentId) return;
  set({
    agentId: msg.agentId,
    messages: msg.messages,
    truncated: msg.truncated,
    loading: false,
    loadedAt: Date.now(),
  });
}

export function answerPermission(agentId: number, allow: boolean): void {
  transport.send({ type: 'answerPermission', agentId, allow });
}
