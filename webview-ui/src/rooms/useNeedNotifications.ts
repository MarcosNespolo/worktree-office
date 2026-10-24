import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'worktree-office.notify';
const STARTUP_QUIET_MS = 8_000;
const REPEAT_AFTER_MS = 120_000;

export interface NotifiableNeed {
  key: string;
  title: string;
  body: string;
}

export type NotifyState = 'unsupported' | 'blocked' | 'off' | 'on';

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeEnabled(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    return;
  }
}

function stateOf(enabled: boolean): NotifyState {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return enabled && Notification.permission === 'granted' ? 'on' : 'off';
}

export function useNeedNotifications(needs: NotifiableNeed[]): {
  state: NotifyState;
  toggle: () => void;
} {
  const [enabled, setEnabled] = useState(readEnabled);
  const [, setPermission] = useState<string>('default');
  const startedAt = useRef(0);
  const previous = useRef(new Set<string>());
  const lastShown = useRef(new Map<string, number>());
  const state = stateOf(enabled);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = new Set(needs.map((need) => need.key));
    const now = Date.now();
    if (state !== 'on' || now - startedAt.current < STARTUP_QUIET_MS || document.hasFocus()) {
      return;
    }
    for (const need of needs) {
      if (before.has(need.key)) continue;
      if (now - (lastShown.current.get(need.key) ?? 0) < REPEAT_AFTER_MS) continue;
      lastShown.current.set(need.key, now);
      const note = new Notification(need.title, { body: need.body, tag: need.key });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    }
  }, [needs, state]);

  const toggle = useCallback(() => {
    if (!supported()) return;
    if (enabled) {
      setEnabled(false);
      writeEnabled(false);
      return;
    }
    if (Notification.permission === 'granted') {
      setEnabled(true);
      writeEnabled(true);
      return;
    }
    if (Notification.permission === 'denied') return;
    void Notification.requestPermission().then((result) => {
      setPermission(result);
      if (result !== 'granted') return;
      setEnabled(true);
      writeEnabled(true);
    });
  }, [enabled]);

  return { state, toggle };
}
