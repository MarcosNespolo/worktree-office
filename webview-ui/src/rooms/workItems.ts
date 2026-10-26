import type {
  RoomInfo,
  RoomNeed,
  RoomPullRequest,
  SessionInfo,
  TaskInfo,
} from '../../../core/src/messages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { type AgentNeed, collectAgentNeeds } from './agentNeeds.js';
import { useRoomsState } from './roomsStore.js';
import { stillWorking, useSessionsInfo } from './sessionsStore.js';
import { useTasksState } from './tasksStore.js';
import { sessionStateView, type StateView, type WorkState } from './workState.js';

export interface WorkItem {
  key: string;
  title: string;
  view: StateView;
  room: string | null;
  agentId: number | null;
  taskId: string | null;
  pr: RoomPullRequest | null;
  at: number | null;
  lobby: boolean;
}

export interface WorkItemTarget {
  agentId: number | null;
  room: string | null;
  taskId: string | null;
}

const ACTIVE_TASK = new Set(['queued', 'preparing', 'starting', 'blocked', 'running', 'failed']);
const COMMIT_PREFIX = /^(feat|fix|chore|docs|refactor|perf|test|style|build|ci)(\([^)]*\))?!?:\s*/i;

const NEED_REASON: Record<string, (need: RoomNeed) => string> = {
  'changes-requested': () => 'changes requested',
  'checks-failing': () => 'checks failing',
  'ready-to-merge': () => 'ready to merge',
  'stale-worktree': (need) => (need.state === 'ready' ? 'merged' : 'closed'),
  'dev-server': () => 'dev server running',
  field: (need) => need.title,
};

export function cleanTitle(title: string): string {
  return title.replace(COMMIT_PREFIX, '').trim();
}

function newest(ids: number[], sessions: ReadonlyMap<number, SessionInfo>): number | null {
  let best: number | null = null;
  for (const id of ids) {
    const at = sessions.get(id)?.lastActivityAt ?? 0;
    if (best === null || at > (sessions.get(best)?.lastActivityAt ?? 0)) best = id;
  }
  return best;
}

function needView(roomNeeds: RoomNeed[], state: RoomNeed['state']): StateView | null {
  const need = roomNeeds.find((item) => item.state === state);
  if (!need) return null;
  const reason = NEED_REASON[need.kind]?.(need) ?? need.title;
  return { state: state as WorkState, detail: reason };
}

interface BuildInput {
  rooms: readonly RoomInfo[];
  needs: readonly RoomNeed[];
  tasks: readonly TaskInfo[];
  sessions: ReadonlyMap<number, SessionInfo>;
  agents: readonly number[];
  agentNeeds: readonly AgentNeed[];
  busyIds: ReadonlySet<number>;
  officeState: OfficeState;
}

export function buildWorkItems(input: BuildInput): WorkItem[] {
  const { rooms, needs, tasks, sessions, agents, agentNeeds, busyIds, officeState } = input;
  const needOf = new Map(agentNeeds.map((need) => [need.id, need.kind]));
  const roomLabels = new Set(rooms.map((room) => room.label));
  const byRoom = new Map<string, number[]>();
  const lobby: number[] = [];
  for (const id of agents) {
    const character = officeState.characters.get(id);
    if (!character || character.isSubagent) continue;
    const label = character.directoryName;
    if (label && roomLabels.has(label)) byRoom.set(label, [...(byRoom.get(label) ?? []), id]);
    else lobby.push(id);
  }
  const working = (id: number): boolean =>
    busyIds.has(id) ||
    stillWorking(
      officeState.characters.get(id)?.isActive,
      sessions.get(id)?.lastActivityAt ?? null,
    );

  const linkedLobby = new Set<number>();
  const items: WorkItem[] = [];
  for (const room of rooms) {
    const own = byRoom.get(room.label) ?? [];
    const prNumber = room.pr?.number;
    const linked =
      prNumber === undefined
        ? []
        : lobby.filter((id) => sessions.get(id)?.prNumbers.includes(prNumber));
    const ids = [...own, ...linked];
    const task =
      tasks.find((item) => item.room === room.label && ACTIVE_TASK.has(item.status)) ?? null;
    const roomNeeds = needs.filter((need) => need.room === room.label);
    if (!room.branch && ids.length === 0 && !task && roomNeeds.length === 0 && !room.serverUp) {
      continue;
    }
    for (const id of linked) linkedLobby.add(id);
    const primary = newest(own.length > 0 ? own : linked, sessions);
    const asking =
      ids.find((id) => needOf.get(id) === 'approval') ?? ids.find((id) => needOf.has(id));
    const busy = ids.find(working);
    let view: StateView;
    let agentId = primary;
    if (asking !== undefined) {
      agentId = asking;
      view = {
        state: 'attention',
        detail: needOf.get(asking) === 'approval' ? 'approval' : 'reply',
      };
    } else if (task?.status === 'blocked') {
      view = { state: 'attention', detail: 'blocked' };
    } else if (task?.status === 'failed') {
      view = { state: 'failed', detail: task.detail || null };
    } else if (busy !== undefined) {
      agentId = busy;
      view = { state: 'working', detail: sessions.get(busy)?.stage ?? null };
    } else if (task && task.status !== 'running') {
      view = { state: task.status === 'queued' ? 'queued' : 'working', detail: task.status };
    } else {
      view =
        needView(roomNeeds, 'attention') ??
        needView(roomNeeds, 'ready') ??
        needView(roomNeeds, 'idle') ??
        sessionStateView(primary === null ? undefined : sessions.get(primary), null, false, false);
      if (primary === null && view.state === 'idle' && !view.detail) {
        view = { state: 'idle', detail: 'no session' };
      }
    }
    const session = primary === null ? undefined : sessions.get(primary);
    const title =
      (room.pr && cleanTitle(room.pr.title)) ||
      session?.title ||
      task?.title ||
      room.branch ||
      room.label;
    items.push({
      key: `room:${room.label}`,
      title,
      view,
      room: room.label,
      agentId,
      taskId: task?.id ?? null,
      pr: room.pr,
      at: session?.lastActivityAt ?? null,
      lobby: false,
    });
  }

  for (const id of lobby) {
    if (linkedLobby.has(id)) continue;
    const session = sessions.get(id);
    const need = needOf.get(id) ?? null;
    const task = tasks.find((item) => item.agentId === id) ?? null;
    items.push({
      key: `session:${id}`,
      title: session?.title ?? task?.title ?? `Session ${id}`,
      view: sessionStateView(session, need, working(id), officeState.characters.get(id)?.isActive),
      room: null,
      agentId: id,
      taskId: task?.id ?? null,
      pr: null,
      at: session?.lastActivityAt ?? null,
      lobby: true,
    });
  }

  for (const task of tasks) {
    if (task.room !== null || !ACTIVE_TASK.has(task.status)) continue;
    if (task.agentId !== null && agents.includes(task.agentId)) continue;
    const state: WorkState =
      task.status === 'failed' ? 'failed' : task.status === 'queued' ? 'queued' : 'working';
    items.push({
      key: `task:${task.id}`,
      title: task.title,
      view: { state, detail: task.status === 'failed' ? task.detail || null : task.status },
      room: null,
      agentId: null,
      taskId: task.id,
      pr: null,
      at: null,
      lobby: false,
    });
  }
  return items;
}

export function targetOf(item: WorkItem): WorkItemTarget {
  return { agentId: item.agentId, room: item.room, taskId: item.taskId };
}

export function findItem(
  items: readonly WorkItem[],
  target: WorkItemTarget,
  roomOfAgent: string | null,
): WorkItem | undefined {
  if (target.room !== null) {
    const byRoom = items.find((item) => item.room === target.room);
    if (byRoom) return byRoom;
  }
  if (target.agentId !== null) {
    const exact = items.find((item) => item.agentId === target.agentId);
    if (exact) return exact;
    if (roomOfAgent) return items.find((item) => item.room === roomOfAgent);
    return undefined;
  }
  if (target.taskId !== null) return items.find((item) => item.taskId === target.taskId);
  return undefined;
}

export function useWorkItems(
  officeState: OfficeState,
  agents: number[],
  agentStatuses: Record<number, string>,
  agentAwaitingInput: Record<number, boolean>,
  agentTools: Record<number, ToolActivity[]>,
): { items: WorkItem[]; agentNeeds: AgentNeed[] } {
  const { rooms, needs } = useRoomsState();
  const { tasks } = useTasksState();
  const sessions = useSessionsInfo();
  const agentNeeds = collectAgentNeeds(
    officeState,
    agents,
    agentStatuses,
    agentAwaitingInput,
    agentTools,
  );
  const busyIds = new Set(
    Object.entries(agentTools)
      .filter(([, tools]) => tools.some((tool) => !tool.done))
      .map(([id]) => Number(id)),
  );
  const items = buildWorkItems({
    rooms,
    needs,
    tasks,
    sessions,
    agents,
    agentNeeds,
    busyIds,
    officeState,
  });
  return { items, agentNeeds };
}
