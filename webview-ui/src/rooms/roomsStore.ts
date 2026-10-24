import { useSyncExternalStore } from 'react';

import type { RoomsState } from '../../../core/src/messages.js';

const EMPTY: RoomsState = { type: 'roomsState', github: 'off', rooms: [], needs: [] };

let current: RoomsState = EMPTY;
let currentJson = JSON.stringify(EMPTY);
const listeners = new Set<() => void>();

export function setRoomsState(next: RoomsState): void {
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

export function useRoomsState(): RoomsState {
  return useSyncExternalStore(subscribe, () => current);
}
