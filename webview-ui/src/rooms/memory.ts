import type { MachineMemory, RoomInfo, SessionInfo } from '../../../core/src/messages.js';
import type { WorkItem } from './workItems.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const LOW_FREE_RATIO = 0.1;

export function formatBytes(bytes: number): string {
  return bytes >= GB
    ? `${(bytes / GB).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / MB))} MB`;
}

export function shownBytes(bytes: number | null | undefined): string | null {
  return bytes ? formatBytes(bytes) : null;
}

export function machineSummary(
  memory: MachineMemory | null,
): { text: string; low: boolean } | null {
  if (!memory || memory.totalBytes <= 0) return null;
  const used = Math.max(0, memory.totalBytes - memory.freeBytes);
  return {
    text: `RAM ${formatBytes(used)} / ${formatBytes(memory.totalBytes)} · ${formatBytes(memory.freeBytes)} free`,
    low: memory.freeBytes / memory.totalBytes < LOW_FREE_RATIO,
  };
}

export function itemMemory(
  item: WorkItem,
  rooms: readonly RoomInfo[],
  sessions: ReadonlyMap<number, SessionInfo>,
): string | null {
  if (item.room !== null) {
    return shownBytes(rooms.find((room) => room.label === item.room)?.memoryBytes);
  }
  return item.agentId === null ? null : shownBytes(sessions.get(item.agentId)?.memoryBytes);
}

export function panelMemory(
  room: RoomInfo | undefined,
  session: SessionInfo | undefined,
): { text: string; title: string } | null {
  const roomBytes = shownBytes(room?.memoryBytes);
  const sessionBytes = shownBytes(session?.memoryBytes);
  if (roomBytes) {
    return {
      text: roomBytes,
      title: sessionBytes
        ? `RAM of this worktree. This session and what it started: ${sessionBytes}.`
        : 'RAM of this worktree: its sessions and the processes started from its folder.',
    };
  }
  return sessionBytes
    ? { text: sessionBytes, title: 'RAM of this session and every process it started.' }
    : null;
}
