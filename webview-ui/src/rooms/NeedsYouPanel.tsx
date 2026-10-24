import { useState } from 'react';

import type { RoomNeed } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { collectAgentNeeds } from './agentNeeds.js';
import { requestRelease } from './releaseStore.js';
import { useRoomsState } from './roomsStore.js';
import { sendToAgent, useTasksState } from './tasksStore.js';

const RELEASABLE = new Set<string>(['stale-worktree', 'dev-server']);

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

function ReplyBox({ agentId }: { agentId: number }) {
  const [text, setText] = useState('');
  const send = (): void => {
    if (!text.trim()) return;
    sendToAgent(agentId, text);
    setText('');
  };
  return (
    <div className="flex gap-6 mt-4">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') send();
        }}
        placeholder="Reply, or 1, 2, 3 for a menu"
        className="flex-1 min-w-0 bg-bg-dark text-text text-sm px-6 py-2 border-2 border-border outline-none font-[inherit]"
        data-testid="reply-input"
      />
      <Button size="sm" onClick={send}>
        Send
      </Button>
    </div>
  );
}

function NeedRow({ need }: { need: RoomNeed }) {
  return (
    <div
      className="px-10 py-6 border-b border-border flex items-center gap-10"
      data-testid="needs-you-item"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-tight">{need.title}</div>
        <div className="text-2xs text-text-muted">{need.room}</div>
      </div>
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
  const [open, setOpen] = useState(true);
  if (rooms.length === 0 && agents.length === 0) return null;
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
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center justify-between px-10 py-6 bg-transparent border-0 text-text text-lg cursor-pointer"
      >
        <span>{total > 0 ? `Needs you (${total})` : 'Needs you'}</span>
        <span className="text-sm text-text-muted">{open ? 'hide' : 'show'}</span>
      </button>
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
                <div className="text-2xs text-text-muted">{need.room}</div>
                {terminalAgentIds.includes(need.id) && <ReplyBox agentId={need.id} />}
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
              </div>
              <Button size="sm" onClick={() => task.agentId !== null && focus(task.agentId)}>
                Show
              </Button>
            </div>
          ))}
          {needs.map((need) => (
            <NeedRow key={need.id} need={need} />
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
