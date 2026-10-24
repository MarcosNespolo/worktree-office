import { useSyncExternalStore } from 'react';

import type { TasksState } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

const EMPTY: TasksState = {
  type: 'tasksState',
  tasks: [],
  maxActive: 0,
  active: 0,
  splitting: false,
};

let current: TasksState = EMPTY;
let currentJson = JSON.stringify(EMPTY);
const listeners = new Set<() => void>();

export function setTasksState(next: TasksState): void {
  const json = JSON.stringify(next);
  if (json === currentJson) return;
  current = next;
  currentJson = json;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTasksState(): TasksState {
  return useSyncExternalStore(subscribe, () => current);
}

export function startTasks(text: string): void {
  transport.send({ type: 'startTasks', text });
}

export function cancelTask(id: string): void {
  transport.send({ type: 'cancelTask', id });
}

export function sendToAgent(agentId: number, text: string): void {
  transport.send({ type: 'sendToAgent', agentId, text });
}
