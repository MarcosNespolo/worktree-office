import { useEffect, useRef } from 'react';

import { Button } from '../components/ui/Button.js';
import type { OfficeState } from '../office/engine/officeState.js';
import {
  answerPermission,
  closeConversation,
  openConversation,
  refreshConversation,
  useConversation,
} from './conversationStore.js';
import { Markdown } from './markdown.js';
import { ReplyBox } from './ReplyBox.js';
import { replyHint } from './replyHint.js';
import { useReplyState } from './replyStore.js';
import { idleLabel, useSessionsInfo } from './sessionsStore.js';

const REFRESH_AFTER_REPLY_MS = 3_000;

interface ConversationPanelProps {
  officeState: OfficeState;
  terminalAgentIds: number[];
  approvalAgentIds: number[];
  onOpenTerminal: (agentId: number) => void;
}

function timeOf(at: number | null): string {
  if (at === null) return '';
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return today
    ? time
    : `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${time}`;
}

export function ConversationPanel({
  officeState,
  terminalAgentIds,
  approvalAgentIds,
  onOpenTerminal,
}: ConversationPanelProps) {
  const { agentId, messages, truncated, loading, loadedAt } = useConversation();
  const sessions = useSessionsInfo();
  const { result, sentTo } = useReplyState();
  const session = agentId === null ? undefined : sessions.get(agentId);
  const lastActivityAt = session?.lastActivityAt ?? null;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agentId !== null) refreshConversation();
  }, [agentId, lastActivityAt]);

  useEffect(() => {
    if (!result?.ok || sentTo === null || sentTo !== agentId) return;
    const timer = setTimeout(() => {
      if (result.agentId !== agentId) openConversation(result.agentId);
      else refreshConversation();
    }, REFRESH_AFTER_REPLY_MS);
    return () => clearTimeout(timer);
  }, [result, sentTo, agentId]);

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [loadedAt]);

  if (agentId === null) return null;
  const inOffice = terminalAgentIds.includes(agentId);
  const needsApproval = approvalAgentIds.includes(agentId);
  const room = officeState.characters.get(agentId)?.directoryName ?? 'lobby';
  const idle = idleLabel(lastActivityAt);
  const title = session?.title ?? `Session ${agentId}`;

  const show = (): void => {
    officeState.selectedAgentId = agentId;
    officeState.cameraFollowId = agentId;
    if (inOffice) onOpenTerminal(agentId);
  };

  return (
    <div
      className="absolute top-[72px] left-8 z-[44] w-[560px] max-w-[calc(100%-420px)] max-h-[calc(100vh-150px)] pixel-panel flex flex-col"
      data-testid="conversation-panel"
    >
      <div className="flex items-center gap-10 px-10 py-6 border-b-2 border-border">
        <div className="flex-1 min-w-0">
          <div className="text-lg leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
            {title}
          </div>
          <div className="text-2xs text-text-muted">
            {room}
            {idle ? ` · ${idle}` : ''}
            {inOffice ? ' · office terminal' : ''}
          </div>
        </div>
        <Button size="sm" onClick={show} data-testid="conversation-show">
          {inOffice ? 'Terminal' : 'Show'}
        </Button>
        <button
          type="button"
          onClick={closeConversation}
          title="Close"
          className="p-0 bg-transparent border-0 text-lg text-text-muted hover:text-text cursor-pointer"
          data-testid="conversation-close"
        >
          ×
        </button>
      </div>
      <div
        ref={scroller}
        className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar px-10 py-6 flex flex-col gap-10"
        data-testid="conversation-messages"
      >
        {truncated && (
          <div className="text-2xs text-text-muted text-center">Older messages are not shown.</div>
        )}
        {loading && messages.length === 0 && (
          <div className="text-sm text-text-muted">Reading the conversation...</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-sm text-text-muted">No messages yet.</div>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.at ?? 0}-${index}`}
            className={`text-sm leading-snug ${message.role === 'user' ? 'pl-24' : 'pr-24'}`}
            data-testid={`conversation-${message.role}`}
          >
            <div
              className={`text-2xs mb-2 ${message.role === 'user' ? 'text-accent-bright text-right' : 'text-text-muted'}`}
            >
              {message.role === 'user' ? 'You' : 'Claude'}
              {message.at !== null ? ` · ${timeOf(message.at)}` : ''}
            </div>
            <div
              className={`px-8 py-6 border-2 border-border ${message.role === 'user' ? 'bg-bg-dark' : ''}`}
            >
              <Markdown text={message.text} />
            </div>
          </div>
        ))}
      </div>
      <div className="px-10 py-6 border-t-2 border-border">
        {needsApproval && inOffice && (
          <div className="flex items-center gap-8 mb-6" data-testid="conversation-approval">
            <span className="flex-1 text-sm text-status-permission">
              Claude Code asks for permission.
            </span>
            <Button
              size="sm"
              variant="accent"
              onClick={() => answerPermission(agentId, true)}
              data-testid="conversation-approve"
            >
              Approve
            </Button>
            <Button
              size="sm"
              onClick={() => answerPermission(agentId, false)}
              data-testid="conversation-deny"
            >
              Deny
            </Button>
          </div>
        )}
        {needsApproval && !inOffice && (
          <div className="text-2xs text-status-permission mb-6">
            This session waits for a permission answer in the app it runs in.
          </div>
        )}
        <ReplyBox
          agentId={agentId}
          hint={replyHint(session, inOffice)}
          images={!needsApproval}
          multiline
        />
      </div>
    </div>
  );
}
