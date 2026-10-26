import { useState } from 'react';

import type { RoomInfo, RoomNeed, SessionInfo } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { collectAgentNeeds } from './agentNeeds.js';
import { AttachButton, AttachmentList } from './Attachments.js';
import { requestRelease } from './releaseStore.js';
import { replyToSession, useReplyState } from './replyStore.js';
import { useRoomsState } from './roomsStore.js';
import { useSessionsInfo } from './sessionsStore.js';
import { useTasksState } from './tasksStore.js';
import { useAttachments } from './useAttachments.js';
import { type NotifyState, useNeedNotifications } from './useNeedNotifications.js';

const RELEASABLE = new Set<string>(['stale-worktree', 'dev-server']);
const APP_NAMES: Record<string, string> = {
  'claude-vscode': 'VS Code',
  'claude-desktop': 'the Claude app',
  cli: 'another terminal',
};
const MESSAGE_END_CHARS = 160;
const SESSION_NEED_KINDS = new Set<string>([
  'field',
  'changes-requested',
  'checks-failing',
  'ready-to-merge',
]);

const NOTIFY_LABEL: Record<NotifyState, string> = {
  unsupported: '',
  blocked: 'alerts blocked',
  off: 'alerts off',
  on: 'alerts on',
};

const NOTIFY_HINT: Record<NotifyState, string> = {
  unsupported: '',
  blocked: 'Notifications are blocked for this page in the browser settings.',
  off: 'Get a system notification when something new needs you and this tab is not focused.',
  on: 'System notifications are on. Click to turn them off.',
};

interface NeedsYouPanelProps {
  officeState: OfficeState;
  agents: number[];
  agentStatuses: Record<number, string>;
  agentAwaitingInput: Record<number, boolean>;
  agentTools: Record<number, ToolActivity[]>;
  terminalAgentIds: number[];
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-accent-bright hover:text-accent no-underline"
    >
      {children}
    </a>
  );
}

function replyHint(session: SessionInfo | null | undefined, inOffice: boolean): string | null {
  if (inOffice) return null;
  const app = session?.app ? APP_NAMES[session.app] : undefined;
  return app
    ? `Replying moves this conversation from ${app} to an office terminal. Answer it only here from then on.`
    : 'Replying continues this conversation in an office terminal.';
}

function ReplyBox({
  agentId,
  hint,
  images = true,
}: {
  agentId: number;
  hint?: string | null;
  images?: boolean;
}) {
  const [text, setText] = useState('');
  const { sending } = useReplyState();
  const attachments = useAttachments();
  const send = (): void => {
    if (!text.trim() || sending !== null || attachments.uploading) return;
    replyToSession(agentId, text, attachments.paths);
    setText('');
    attachments.clear();
  };
  return (
    <div className="mt-4" onDrop={attachments.onDrop} onDragOver={attachments.onDragOver}>
      <AttachmentList attachments={attachments} />
      <div className="flex items-center gap-6">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send();
          }}
          onPaste={images ? attachments.onPaste : undefined}
          placeholder="Reply, or 1, 2, 3 for a menu"
          className="flex-1 min-w-0 bg-bg-dark text-text text-sm px-6 py-2 border-2 border-border outline-none font-[inherit]"
          data-testid="reply-input"
        />
        {images && <AttachButton attachments={attachments} />}
        <Button size="sm" onClick={send} disabled={sending !== null || attachments.uploading}>
          Send
        </Button>
      </div>
      {hint && (
        <div className="text-2xs text-text-muted leading-tight mt-2" data-testid="reply-hint">
          {hint}
        </div>
      )}
    </div>
  );
}

function latestSession(list: readonly SessionInfo[]): SessionInfo | null {
  let best: SessionInfo | null = null;
  for (const session of list) {
    if (!best || (session.lastActivityAt ?? 0) > (best.lastActivityAt ?? 0)) best = session;
  }
  return best;
}

function sessionForNeed(
  need: RoomNeed,
  rooms: readonly RoomInfo[],
  sessions: ReadonlyMap<number, SessionInfo>,
  officeState: OfficeState,
): SessionInfo | null {
  if (!SESSION_NEED_KINDS.has(need.kind)) return null;
  const all = [...sessions.values()];
  const prNumber = rooms.find((room) => room.label === need.room)?.pr?.number;
  if (prNumber !== undefined) {
    const linked = latestSession(all.filter((session) => session.prNumbers.includes(prNumber)));
    if (linked) return linked;
  }
  return latestSession(
    all.filter((session) => officeState.characters.get(session.id)?.directoryName === need.room),
  );
}

function roomAndTitle(room: string, session: SessionInfo | null | undefined): string {
  return session?.title ? `${room} · ${session.title}` : room;
}

function endOf(text: string): string {
  if (text.length <= MESSAGE_END_CHARS) return text;
  const end = text.slice(-MESSAGE_END_CHARS);
  const wordStart = end.indexOf(' ');
  return `…${wordStart >= 0 && wordStart < 20 ? end.slice(wordStart + 1) : end}`;
}

function LastMessage({ session }: { session: SessionInfo | null | undefined }) {
  if (!session?.lastText) return null;
  return (
    <div
      className="text-2xs text-text-muted leading-tight mt-2 line-clamp-4"
      title={session.lastText}
      data-testid="needs-you-message"
    >
      {endOf(session.lastText)}
    </div>
  );
}

function NeedRow({
  need,
  session,
  inOffice,
  onShow,
}: {
  need: RoomNeed;
  session: SessionInfo | null;
  inOffice: (agentId: number) => boolean;
  onShow: (id: number) => void;
}) {
  return (
    <div
      className="px-10 py-6 border-b border-border flex items-center gap-10"
      data-testid="needs-you-item"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-tight">{need.title}</div>
        <div className="text-2xs text-text-muted">{roomAndTitle(need.room, session)}</div>
        <LastMessage session={session} />
        {session && (
          <ReplyBox agentId={session.id} hint={replyHint(session, inOffice(session.id))} />
        )}
      </div>
      {session && (
        <Button size="sm" onClick={() => onShow(session.id)}>
          Show
        </Button>
      )}
      {need.url && <ExternalLink href={need.url}>Open</ExternalLink>}
      {need.prUrl && need.prUrl !== need.url && <ExternalLink href={need.prUrl}>PR</ExternalLink>}
      {RELEASABLE.has(need.kind) && (
        <Button size="sm" onClick={() => requestRelease(need.room)}>
          Release
        </Button>
      )}
    </div>
  );
}

export function NeedsYouPanel({
  officeState,
  agents,
  agentStatuses,
  agentAwaitingInput,
  agentTools,
  terminalAgentIds,
}: NeedsYouPanelProps) {
  const { needs, github, rooms } = useRoomsState();
  const { tasks } = useTasksState();
  const sessions = useSessionsInfo();
  const [open, setOpen] = useState(true);
  const agentNeeds = collectAgentNeeds(
    officeState,
    agents,
    agentStatuses,
    agentAwaitingInput,
    agentTools,
  );
  const blockedTasks = tasks.filter(
    (task) =>
      task.status === 'blocked' &&
      task.agentId !== null &&
      !agentNeeds.some((need) => need.id === task.agentId),
  );
  const notify = useNeedNotifications([
    ...agentNeeds.map((need) => ({
      key: `agent:${need.id}:${need.title}`,
      title: need.title,
      body: need.room,
    })),
    ...blockedTasks.map((task) => ({
      key: `task:${task.id}`,
      title: task.detail,
      body: task.room ?? task.title,
    })),
    ...needs.map((need) => ({ key: need.id, title: need.title, body: need.room })),
  ]);
  if (rooms.length === 0 && agents.length === 0) return null;
  const total = agentNeeds.length + blockedTasks.length + needs.length;

  const focus = (id: number): void => {
    officeState.selectedAgentId = id;
    officeState.cameraFollowId = id;
  };

  return (
    <div
      className="absolute top-8 right-8 z-20 w-[380px] pixel-panel flex flex-col"
      data-testid="needs-you-panel"
    >
      <div className="flex items-center gap-10 px-10 py-6">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex-1 text-left p-0 bg-transparent border-0 text-text text-lg cursor-pointer"
        >
          {total > 0 ? `Needs you (${total})` : 'Needs you'}
        </button>
        {notify.state !== 'unsupported' && (
          <button
            type="button"
            onClick={notify.toggle}
            title={NOTIFY_HINT[notify.state]}
            className={`p-0 bg-transparent border-0 text-sm cursor-pointer ${
              notify.state === 'on' ? 'text-accent-bright' : 'text-text-muted'
            }`}
            data-testid="needs-you-notify"
          >
            {NOTIFY_LABEL[notify.state]}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="p-0 bg-transparent border-0 text-sm text-text-muted cursor-pointer"
        >
          {open ? 'hide' : 'show'}
        </button>
      </div>
      {open && (
        <div className="max-h-[50vh] overflow-y-auto pixel-scrollbar border-t-2 border-border">
          {total === 0 && (
            <div className="px-10 py-8 text-sm text-text-muted">Nothing needs you right now.</div>
          )}
          {agentNeeds.map((need) => (
            <div
              key={`agent-${need.id}`}
              className="px-10 py-6 border-b border-border flex items-center gap-10"
              data-testid="needs-you-item"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm leading-tight text-status-permission">{need.title}</div>
                <div className="text-2xs text-text-muted">
                  {roomAndTitle(need.room, sessions.get(need.id))}
                </div>
                <LastMessage session={sessions.get(need.id)} />
                {(terminalAgentIds.includes(need.id) ||
                  (need.kind === 'input' && sessions.has(need.id))) && (
                  <ReplyBox
                    agentId={need.id}
                    hint={replyHint(sessions.get(need.id), terminalAgentIds.includes(need.id))}
                    images={need.kind === 'input'}
                  />
                )}
              </div>
              <Button size="sm" onClick={() => focus(need.id)}>
                Show
              </Button>
            </div>
          ))}
          {blockedTasks.map((task) => (
            <div
              key={`task-${task.id}`}
              className="px-10 py-6 border-b border-border flex items-center gap-10"
              data-testid="needs-you-item"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm leading-tight text-status-permission">{task.detail}</div>
                <div className="text-2xs text-text-muted">{task.room ?? task.title}</div>
                {task.agentId !== null && terminalAgentIds.includes(task.agentId) && (
                  <ReplyBox agentId={task.agentId} images={false} />
                )}
              </div>
              <Button size="sm" onClick={() => task.agentId !== null && focus(task.agentId)}>
                Show
              </Button>
            </div>
          ))}
          {needs.map((need) => (
            <NeedRow
              key={need.id}
              need={need}
              session={sessionForNeed(need, rooms, sessions, officeState)}
              inOffice={(agentId) => terminalAgentIds.includes(agentId)}
              onShow={focus}
            />
          ))}
        </div>
      )}
      {github === 'unavailable' && (
        <div className="px-10 py-6 text-2xs text-warning border-t-2 border-border">
          Pull requests unavailable: install the GitHub CLI and run gh auth login.
        </div>
      )}
    </div>
  );
}
