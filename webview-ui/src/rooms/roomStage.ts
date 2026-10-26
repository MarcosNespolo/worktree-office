import type { RoomInfo, SessionInfo } from '../../../core/src/messages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { idleLabel } from './sessionsStore.js';

export interface RoomStage {
  text: string;
  tone: string;
}

export interface RoomStageContext {
  sessions: ReadonlyMap<number, SessionInfo>;
  officeState: OfficeState;
  needIds: ReadonlySet<number>;
}

const STAGE_TONE: Record<string, string> = {
  planning: 'text-accent-bright',
  coding: 'text-status-active',
  testing: 'text-warning',
  reviewing: 'text-accent-bright',
  reading: 'text-text-muted',
  working: 'text-status-active',
};

export function sessionsInRoom(
  label: string,
  sessions: ReadonlyMap<number, SessionInfo>,
  officeState: OfficeState,
): SessionInfo[] {
  return [...sessions.values()].filter(
    (session) => officeState.characters.get(session.id)?.directoryName === label,
  );
}

export function roomStage(room: RoomInfo, context: RoomStageContext): RoomStage | null {
  const present = sessionsInRoom(room.label, context.sessions, context.officeState);
  if (present.length === 0) {
    return room.pr?.state === 'merged' ? { text: 'done', tone: 'text-status-success' } : null;
  }
  const latest = present.reduce((best, session) =>
    (session.lastActivityAt ?? 0) > (best.lastActivityAt ?? 0) ? session : best,
  );
  if (context.needIds.has(latest.id)) return { text: 'needs you', tone: 'text-status-permission' };
  if (context.officeState.characters.get(latest.id)?.isActive) {
    const stage = latest.stage ?? 'working';
    return { text: stage, tone: STAGE_TONE[stage] ?? 'text-status-active' };
  }
  return { text: idleLabel(latest.lastActivityAt) ?? 'idle', tone: 'text-text-muted' };
}
