import type { SessionInfo } from '../../../core/src/messages.js';
import { idleLabel, stillWorking } from './sessionsStore.js';

export type WorkState = 'attention' | 'working' | 'ready' | 'idle' | 'failed' | 'queued';

export const STATE_COLOR: Record<WorkState, string> = {
  attention: 'var(--color-state-attention)',
  working: 'var(--color-state-working)',
  ready: 'var(--color-state-ready)',
  idle: 'var(--color-state-idle)',
  failed: 'var(--color-state-failed)',
  queued: 'var(--color-state-idle)',
};

export const STATE_LABEL: Record<WorkState, string> = {
  attention: 'Needs you',
  working: 'Working',
  ready: 'Ready',
  idle: 'Idle',
  failed: 'Failed',
  queued: 'Queued',
};

export interface StateView {
  state: WorkState;
  detail: string | null;
}

export function sessionStateView(
  session: SessionInfo | undefined,
  need: 'approval' | 'input' | null,
  busy: boolean,
  isActive: boolean | undefined,
): StateView {
  if (need === 'approval') return { state: 'attention', detail: 'approval' };
  if (need === 'input') return { state: 'attention', detail: 'reply' };
  const lastActivityAt = session?.lastActivityAt ?? null;
  if (busy || stillWorking(isActive, lastActivityAt)) {
    return { state: 'working', detail: session?.stage ?? null };
  }
  const idle = idleLabel(lastActivityAt);
  return { state: 'idle', detail: idle ? idle.replace(/^idle /, '') : null };
}
