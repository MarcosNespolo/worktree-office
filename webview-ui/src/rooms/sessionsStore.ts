import { useSyncExternalStore } from 'react';

import type { SessionInfo, SessionsInfo } from '../../../core/src/messages.js';

let current = new Map<number, SessionInfo>();
let currentJson = '[]';
const listeners = new Set<() => void>();

export function setSessionsInfo(next: SessionsInfo): void {
  const json = JSON.stringify(next.sessions);
  if (json === currentJson) return;
  current = new Map(next.sessions.map((session) => [session.id, session]));
  currentJson = json;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSessionsInfo(): ReadonlyMap<number, SessionInfo> {
  return useSyncExternalStore(subscribe, () => current);
}

export function getSessionInfo(id: number): SessionInfo | undefined {
  return current.get(id);
}

export const ACTIVE_STALE_MS = 10 * 60_000;

export function stillWorking(
  isActive: boolean | undefined,
  lastActivityAt: number | null,
  now = Date.now(),
): boolean {
  return isActive === true && lastActivityAt !== null && now - lastActivityAt < ACTIVE_STALE_MS;
}

export function idleLabel(lastActivityAt: number | null, now = Date.now()): string | null {
  if (lastActivityAt === null) return null;
  const minutes = Math.floor((now - lastActivityAt) / 60_000);
  if (minutes < 1) return null;
  if (minutes < 60) return `idle ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `idle ${hours}h` : `idle ${Math.floor(hours / 24)}d`;
}
