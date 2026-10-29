import { type KeyboardEvent, useState } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { useRoomsState } from './roomsStore.js';
import { selectTarget, useSelection } from './selectionStore.js';
import { useTasksState } from './tasksStore.js';
import { IconButton } from './ui.js';
import { type NotifyState, useNeedNotifications } from './useNeedNotifications.js';
import { findItem, targetOf, useWorkItems, type WorkItem } from './workItems.js';
import { STATE_COLOR, type WorkState } from './workState.js';

const GROUPS: Array<{ id: string; label: string; states: WorkState[]; lobby: boolean | null }> = [
  { id: 'attention', label: 'Needs you', states: ['attention', 'failed'], lobby: null },
  { id: 'working', label: 'Working', states: ['working'], lobby: false },
  { id: 'ready', label: 'Ready', states: ['ready'], lobby: false },
  { id: 'queued', label: 'Queued', states: ['queued'], lobby: false },
  { id: 'idle', label: 'Idle', states: ['idle'], lobby: false },
  {
    id: 'other',
    label: 'Other sessions',
    states: ['working', 'idle', 'ready', 'queued'],
    lobby: true,
  },
];

const NOTIFY_ICON: Record<NotifyState, string> = {
  unsupported: '',
  blocked: 'notifications_off',
  off: 'notifications_off',
  on: 'notifications_active',
};

const NOTIFY_HINT: Record<NotifyState, string> = {
  unsupported: '',
  blocked: 'Notifications are blocked for this page in the browser settings.',
  off: 'Get a system notification when something new needs you and this tab is not focused.',
  on: 'System notifications are on. Click to turn them off.',
};

function ago(at: number | null, now = Date.now()): string {
  if (at === null) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function inGroup(item: WorkItem, group: (typeof GROUPS)[number]): boolean {
  if (!group.states.includes(item.view.state)) return false;
  if (group.lobby === null) return true;
  return item.lobby === group.lobby;
}

interface TaskRailProps {
  officeState: OfficeState;
  agents: number[];
  agentStatuses: Record<number, string>;
  agentAwaitingInput: Record<number, boolean>;
  agentTools: Record<number, ToolActivity[]>;
  onNewTask?: () => void;
}

export function TaskRail({
  officeState,
  agents,
  agentStatuses,
  agentAwaitingInput,
  agentTools,
  onNewTask,
}: TaskRailProps) {
  const { items } = useWorkItems(
    officeState,
    agents,
    agentStatuses,
    agentAwaitingInput,
    agentTools,
  );
  const { github } = useRoomsState();
  const { maxActive, active, splitting, freeRooms } = useTasksState();
  const selection = useSelection();
  const [collapsed, setCollapsed] = useState(false);
  const notify = useNeedNotifications(
    items
      .filter((item) => item.view.state === 'attention' || item.view.state === 'failed')
      .map((item) => ({
        key: `${item.key}:${item.view.detail ?? ''}`,
        title: `${item.title}`,
        body: `${item.view.detail ?? 'needs you'} · ${item.room ?? 'lobby'}`,
      })),
  );
  const groups = GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => inGroup(item, group)).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)),
  })).filter((group) => group.items.length > 0);
  const ordered = groups.flatMap((group) => group.items);
  const roomOfAgent =
    selection.agentId === null
      ? null
      : (officeState.characters.get(selection.agentId)?.directoryName ?? null);
  const selected = selection.open ? findItem(items, selection, roomOfAgent) : undefined;
  const attention = groups.find((group) => group.id === 'attention')?.items.length ?? 0;
  const capacity = splitting
    ? 'Reading your tasks...'
    : `${active} of ${maxActive} running · ${
        freeRooms.length > 0 ? `free: ${freeRooms.join(', ')}` : 'no free worktree'
      }`;

  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (ordered.length === 0) return;
    const index = selected ? ordered.findIndex((item) => item.key === selected.key) : -1;
    const next =
      event.key === 'ArrowDown'
        ? ordered[Math.min(ordered.length - 1, index + 1)]
        : ordered[Math.max(0, index - 1)];
    if (next) selectTarget(targetOf(next));
  };

  if (collapsed) {
    return (
      <div
        className="h-full shrink-0 w-[48px] flex flex-col items-center gap-8 py-10 bg-surface ui-surface border-r border-line"
        data-testid="task-rail"
        data-collapsed="true"
      >
        <IconButton icon="left_panel_open" label="Show tasks" onClick={() => setCollapsed(false)} />
        {attention > 0 && (
          <span
            className="min-w-[22px] h-[22px] px-6 rounded-full flex items-center justify-center text-ui-xs font-bold text-surface"
            style={{ background: STATE_COLOR.attention }}
            title={`${attention} need you`}
          >
            {attention}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="h-full shrink-0 w-[288px] flex flex-col bg-surface ui-surface text-ink border-r border-line"
      data-testid="task-rail"
    >
      <div className="px-14 pt-12 pb-10 border-b border-line">
        <div className="flex items-center gap-4">
          <span className="flex-1 text-ui-md font-semibold">Tasks</span>
          {notify.state !== 'unsupported' && (
            <IconButton
              icon={NOTIFY_ICON[notify.state]}
              label={NOTIFY_HINT[notify.state]}
              onClick={notify.toggle}
              className={notify.state === 'on' ? 'text-state-working' : ''}
              data-testid="rail-notify"
            />
          )}
          <IconButton
            icon="left_panel_close"
            label="Hide tasks"
            onClick={() => setCollapsed(true)}
          />
          {onNewTask && (
            <button
              type="button"
              onClick={onNewTask}
              className="ui-btn ui-btn-sm ui-btn-primary ml-4"
              data-testid="new-task"
            >
              <span className="material-symbols-sharp text-[16px]" aria-hidden="true">
                add
              </span>
              New
            </button>
          )}
        </div>
        <div
          className="text-ui-xs text-ink-muted mt-6 truncate"
          title={capacity}
          data-testid="task-capacity"
        >
          {capacity}
        </div>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar px-8 py-8 outline-none"
        tabIndex={0}
        onKeyDown={move}
        aria-label="Tasks"
      >
        {groups.length === 0 && (
          <div className="px-8 py-12 text-ui-sm text-ink-muted">
            Nothing is running. Start a task with New.
          </div>
        )}
        {groups.map((group) => (
          <div key={group.id} className="mb-10" data-testid="rail-group" data-group={group.id}>
            <div className="flex items-center gap-6 px-8 py-4 text-ui-2xs font-semibold uppercase tracking-wide text-ink-faint">
              {group.label}
              <span className="text-ink-faint">{group.items.length}</span>
            </div>
            {group.items.map((item) => {
              const color = STATE_COLOR[item.view.state];
              const isSelected = selected?.key === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectTarget(targetOf(item))}
                  className={`w-full flex gap-10 text-left px-8 py-8 rounded-[8px] border-0 cursor-pointer ${
                    isSelected ? 'bg-surface-raised' : 'bg-transparent hover:bg-surface-raised/60'
                  }`}
                  style={isSelected ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                  data-testid="rail-item"
                  data-key={item.key}
                  data-state={item.view.state}
                >
                  <span
                    className="mt-[6px] w-[8px] h-[8px] rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-8">
                      <span className="flex-1 truncate text-ui-base font-semibold text-ink">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-ui-2xs text-ink-faint">{ago(item.at)}</span>
                    </span>
                    <span className="block truncate text-ui-xs text-ink-muted mt-2">
                      {item.view.detail && <span style={{ color }}>{item.view.detail}</span>}
                      {item.view.detail ? ' · ' : ''}
                      {item.room ?? 'lobby'}
                      {item.pr ? ` · #${item.pr.number}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {github === 'unavailable' && (
        <div className="px-14 py-8 text-ui-xs text-state-attention border-t border-line">
          Pull requests unavailable: install the GitHub CLI and run gh auth login.
        </div>
      )}
    </div>
  );
}
