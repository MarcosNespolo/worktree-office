import { useSyncExternalStore } from 'react';

import type { DiskState } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

const EMPTY: DiskState = {
  type: 'diskState',
  scanning: false,
  measuredAt: null,
  drives: [],
  worktrees: [],
  folders: [],
};

let current: DiskState = EMPTY;
let currentJson = JSON.stringify(EMPTY);
const listeners = new Set<() => void>();

export function setDiskState(next: DiskState): void {
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

export function useDiskState(): DiskState {
  return useSyncExternalStore(subscribe, () => current);
}

export function measureDisk(): void {
  transport.send({ type: 'measureDisk' });
}
