import { useSyncExternalStore } from 'react';

export type PanelTab = 'conversation' | 'terminal';

export interface SelectionTarget {
  agentId: number | null;
  room: string | null;
  taskId: string | null;
}

export interface Selection extends SelectionTarget {
  tab: PanelTab;
  open: boolean;
  full: boolean;
}

let state: Selection = {
  agentId: null,
  room: null,
  taskId: null,
  tab: 'conversation',
  open: false,
  full: false,
};
const listeners = new Set<() => void>();

function set(next: Partial<Selection>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSelection(): Selection {
  return useSyncExternalStore(subscribe, () => state);
}

export function getSelection(): Selection {
  return state;
}

export function selectTarget(target: SelectionTarget, tab?: PanelTab): void {
  set({ ...target, open: true, tab: tab ?? state.tab });
}

export function selectSession(agentId: number, tab?: PanelTab): void {
  selectTarget({ agentId, room: null, taskId: null }, tab);
}

export function showTab(tab: PanelTab): void {
  set({ tab, open: true });
}

export function setFullScreen(full: boolean): void {
  set({ full });
}

export function closePanel(): void {
  set({ open: false, full: false });
}
