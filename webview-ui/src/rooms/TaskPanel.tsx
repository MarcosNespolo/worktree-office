import { type MouseEvent as ReactMouseEvent, useEffect } from 'react';

import { TerminalPaneStack } from '../components/TerminalPaneStack.js';
import { TERMINAL_DRAWER_RESIZE_HANDLE_PX } from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';
import { closeConversation } from './conversationStore.js';
import { ConversationView } from './ConversationView.js';
import { NoSessionView } from './NoSessionView.js';
import { requestRelease } from './releaseStore.js';
import { terminalHint } from './replyHint.js';
import { useReplyState } from './replyStore.js';
import { useRoomsState } from './roomsStore.js';
import {
  closePanel,
  type PanelTab,
  selectSession,
  setFullScreen,
  showTab,
  useSelection,
} from './selectionStore.js';
import { useSessionsInfo } from './sessionsStore.js';
import { StateChip } from './StateChip.js';
import { useTasksState } from './tasksStore.js';
import { TerminalButton } from './TerminalButton.js';
import { IconButton, UiButton } from './ui.js';
import { cleanTitle, findItem, useWorkItems } from './workItems.js';
import { sessionStateView } from './workState.js';

const FOLLOW_MOVED_SESSION_MS = 1_500;

const TABS: Array<{ id: PanelTab; label: string; icon: string }> = [
  { id: 'conversation', label: 'Conversation', icon: 'forum' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
];

const CHECKS_ICON: Record<string, { icon: string; color: string; title: string }> = {
  passing: { icon: 'check_circle', color: 'var(--color-state-ready)', title: 'Checks passing' },
  failing: { icon: 'cancel', color: 'var(--color-state-failed)', title: 'Checks failing' },
  pending: { icon: 'pending', color: 'var(--color-state-attention)', title: 'Checks running' },
};

interface TaskPanelProps {
  officeState: OfficeState;
  agents: number[];
  agentStatuses: Record<number, string>;
  agentAwaitingInput: Record<number, boolean>;
  agentTools: Record<number, ToolActivity[]>;
  terminalAgentIds: number[];
  terminalsAvailable: boolean;
  widthPx: number;
  onResizeStart: (event: ReactMouseEvent) => void;
  onTerminalStatus: (agentId: number, status: TerminalConnectionStatus) => void;
  lastOpenedTerminal: { agentId: number; seq: number } | null;
}

export function TaskPanel({
  officeState,
  agents,
  agentStatuses,
  agentAwaitingInput,
  agentTools,
  terminalAgentIds,
  terminalsAvailable,
  widthPx,
  onResizeStart,
  onTerminalStatus,
  lastOpenedTerminal,
}: TaskPanelProps) {
  const selection = useSelection();
  const sessions = useSessionsInfo();
  const { rooms } = useRoomsState();
  const { tasks } = useTasksState();
  const { result, sentTo } = useReplyState();
  const { agentId, open, full } = selection;
  const tab: PanelTab = terminalsAvailable ? selection.tab : 'conversation';

  useEffect(() => {
    if (!result?.ok || sentTo === null || sentTo !== agentId || result.agentId === agentId) return;
    const moved = result.agentId;
    const timer = setTimeout(() => selectSession(moved), FOLLOW_MOVED_SESSION_MS);
    return () => clearTimeout(timer);
  }, [result, sentTo, agentId]);

  useEffect(() => {
    if (!lastOpenedTerminal) return;
    const current = selection;
    if (!current.open || current.agentId === null) {
      selectSession(lastOpenedTerminal.agentId, 'terminal');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastOpenedTerminal]);

  useEffect(() => {
    if (open && agentId !== null) officeState.selectedAgentId = agentId;
    if (!open) closeConversation();
  }, [open, agentId, officeState]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  const { items, agentNeeds } = useWorkItems(
    officeState,
    agents,
    agentStatuses,
    agentAwaitingInput,
    agentTools,
  );
  const need = agentId === null ? undefined : agentNeeds.find((item) => item.id === agentId);
  const session = agentId === null ? undefined : sessions.get(agentId);
  const character = agentId === null ? undefined : officeState.characters.get(agentId);
  const task =
    selection.taskId !== null
      ? tasks.find((item) => item.id === selection.taskId)
      : agentId === null
        ? undefined
        : tasks.find((item) => item.agentId === agentId);
  const roomLabel = selection.room ?? character?.directoryName ?? task?.room ?? null;
  const room = roomLabel ? rooms.find((item) => item.label === roomLabel) : undefined;
  const item = findItem(items, selection, character?.directoryName ?? null);
  const inOffice = agentId !== null && terminalAgentIds.includes(agentId);
  const present = agentId !== null && agents.includes(agentId);
  const busy = agentId !== null && (agentTools[agentId] ?? []).some((tool) => !tool.done);
  const view =
    item && (item.agentId === agentId || agentId === null)
      ? item.view
      : sessionStateView(session, need?.kind ?? null, busy, character?.isActive);
  const checks = room?.pr?.checks ? CHECKS_ICON[room.pr.checks] : undefined;
  const title =
    (room?.pr && cleanTitle(room.pr.title)) ||
    session?.title ||
    task?.title ||
    item?.title ||
    room?.branch ||
    roomLabel ||
    (agentId === null ? '' : `Session ${agentId}`);

  const frame = full ? 'fixed inset-0 z-[60]' : 'relative h-full shrink-0 border-l border-line';

  return (
    <div
      className={`${frame} ${open ? 'flex' : 'hidden'} flex-col bg-surface ui-surface text-ink`}
      style={full ? undefined : { width: widthPx }}
      data-testid="task-panel"
      data-full={full ? 'true' : 'false'}
    >
      {!full && (
        <div
          className="absolute top-0 left-0 bottom-0 z-40 cursor-col-resize hover:bg-state-working/30"
          style={{ width: TERMINAL_DRAWER_RESIZE_HANDLE_PX }}
          onMouseDown={onResizeStart}
          title="Drag to resize"
        />
      )}
      <div className="flex items-start gap-8 px-16 pt-14 pb-10">
        <div className="flex-1 min-w-0">
          <div className="text-ui-lg font-semibold leading-tight truncate" data-testid="task-title">
            {title}
          </div>
          <div className="flex items-center flex-wrap gap-x-10 gap-y-4 mt-8 text-ui-sm">
            <StateChip view={view} />
            <span className="text-ink-muted">{roomLabel ?? 'lobby'}</span>
            {room?.port !== null && room?.port !== undefined && (
              <a
                href={room.devUrl ?? `http://localhost:${room.port}`}
                target="_blank"
                rel="noopener noreferrer"
                className={room.serverUp ? 'text-link hover:underline' : 'text-ink-faint'}
                title={room.serverUp ? 'Open the app of this worktree' : 'Dev server not running'}
              >
                :{room.port}
              </a>
            )}
            {room?.pr && (
              <a
                href={room.pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-4 text-link hover:underline"
                title={`Pull request ${room.pr.state}`}
              >
                #{room.pr.number}
                {checks && (
                  <span
                    className="material-symbols-sharp text-[15px]"
                    style={{ color: checks.color }}
                    title={checks.title}
                    aria-label={checks.title}
                  >
                    {checks.icon}
                  </span>
                )}
              </a>
            )}
            {!present && agentId !== null && (
              <span className="text-ink-faint">no longer in the office</span>
            )}
          </div>
        </div>
        <IconButton
          icon={full ? 'close_fullscreen' : 'open_in_full'}
          label={full ? 'Exit full screen (Esc)' : 'Full screen'}
          onClick={() => setFullScreen(!full)}
          data-testid="panel-full"
        />
        <IconButton icon="close" label="Close" onClick={closePanel} data-testid="panel-close" />
      </div>
      <div className="flex items-center gap-2 px-12 border-b border-line">
        {TABS.filter((entry) => terminalsAvailable || entry.id !== 'terminal').map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => showTab(entry.id)}
            className={`inline-flex items-center gap-6 h-[38px] px-10 -mb-px border-0 border-b-2 bg-transparent text-ui-sm font-semibold cursor-pointer ${
              tab === entry.id
                ? 'border-state-working text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
            data-testid={`panel-tab-${entry.id}`}
          >
            <span className="material-symbols-sharp text-[17px]" aria-hidden="true">
              {entry.icon}
            </span>
            {entry.label}
          </button>
        ))}
        <div className="flex-1" />
        {room && room.releasable && (room.branch !== null || room.serverUp) && (
          <UiButton
            size="sm"
            variant="ghost"
            onClick={() => requestRelease(room.label)}
            title="Stop the dev server, stash leftovers and free this worktree"
            data-testid="panel-release"
          >
            Release
          </UiButton>
        )}
      </div>
      <div className="flex-1 min-h-0 relative">
        <div
          className={tab === 'conversation' ? 'absolute inset-0 flex flex-col' : 'hidden'}
          data-testid="panel-conversation"
        >
          {agentId !== null ? (
            <ConversationView
              agentId={agentId}
              inOffice={inOffice}
              needsApproval={need?.kind === 'approval'}
              full={full}
              canReply={terminalsAvailable}
            />
          ) : (
            <NoSessionView task={task} prUrl={room?.pr?.url ?? null} />
          )}
        </div>
        <div
          className={tab === 'terminal' ? 'absolute inset-0 bg-bg' : 'hidden'}
          data-testid="panel-terminal"
        >
          {terminalsAvailable && (
            <TerminalPaneStack
              agentIds={terminalAgentIds}
              shownAgentId={inOffice ? agentId : null}
              onStatusChange={onTerminalStatus}
              paneClassName="inset-0"
            />
          )}
          {agentId === null && (
            <div className="absolute inset-0 flex items-center justify-center px-24 text-center bg-surface text-ui-base text-ink-muted">
              No session runs here, so there is no terminal to show.
            </div>
          )}
          {!inOffice && agentId !== null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-12 px-24 text-center bg-surface">
              <div className="text-ui-md font-semibold">This session has no office terminal.</div>
              <div className="text-ui-sm text-ink-muted max-w-[440px]">
                {present ? terminalHint(session) : 'It is no longer in the office.'}
              </div>
              {present && terminalsAvailable && (
                <TerminalButton
                  agentId={agentId}
                  inOffice={false}
                  session={session}
                  label="Open in an office terminal"
                  variant="primary"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
