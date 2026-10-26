import { useEffect, useRef, useState } from 'react';

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
import { TerminalButton } from './TerminalButton.js';
import { IconButton, UiButton } from './ui.js';

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
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (agentId !== null) refreshConversation();
  }, [agentId, lastActivityAt]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

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
    setFull(false);
    officeState.selectedAgentId = agentId;
    officeState.cameraFollowId = agentId;
    if (inOffice) onOpenTerminal(agentId);
  };
  const frame = full
    ? 'fixed inset-0 z-[60] rounded-none'
    : 'absolute top-[72px] left-12 z-[44] w-[640px] max-w-[calc(100%-420px)] max-h-[calc(100vh-150px)]';
  const column = full ? 'w-full max-w-[780px] mx-auto' : '';

  return (
    <div
      className={`${frame} ui-panel ui-surface flex flex-col`}
      data-testid="conversation-panel"
      data-full={full ? 'true' : 'false'}
    >
      <div className="flex items-center gap-8 px-16 py-12 border-b border-line">
        <div className="flex-1 min-w-0">
          <div className="text-ui-lg font-semibold leading-tight truncate">{title}</div>
          <div className="text-ui-xs text-ink-muted mt-2">
            {room}
            {idle ? ` · ${idle}` : ''}
            {inOffice ? ' · office terminal' : ''}
          </div>
        </div>
        <TerminalButton
          agentId={agentId}
          inOffice={inOffice}
          session={session}
          onReveal={show}
          onLeave={() => setFull(false)}
        />
        <IconButton
          icon={full ? 'close_fullscreen' : 'open_in_full'}
          label={full ? 'Exit full screen (Esc)' : 'Full screen'}
          onClick={() => setFull((value) => !value)}
          data-testid="conversation-full"
        />
        <IconButton
          icon="close"
          label="Close"
          onClick={() => {
            setFull(false);
            closeConversation();
          }}
          data-testid="conversation-close"
        />
      </div>
      <div
        ref={scroller}
        className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar px-20 py-16"
        data-testid="conversation-messages"
      >
        <div className={`${column} flex flex-col gap-20`}>
          {truncated && (
            <div className="text-ui-xs text-ink-faint text-center">
              Older messages are not shown.
            </div>
          )}
          {loading && messages.length === 0 && (
            <div className="text-ui-base text-ink-muted">Reading the conversation...</div>
          )}
          {!loading && messages.length === 0 && (
            <div className="text-ui-base text-ink-muted">No messages yet.</div>
          )}
          {messages.map((message, index) => (
            <div
              key={`${message.at ?? 0}-${index}`}
              className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-stretch'}`}
              data-testid={`conversation-${message.role}`}
            >
              <div className="text-ui-xs text-ink-faint mb-4">
                {message.role === 'user' ? 'You' : 'Claude'}
                {message.at !== null ? ` · ${timeOf(message.at)}` : ''}
              </div>
              {message.role === 'user' ? (
                <div className="max-w-[85%] bg-surface-raised border border-line rounded-[12px] px-14 py-10">
                  <Markdown text={message.text} />
                </div>
              ) : (
                <Markdown text={message.text} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="px-16 py-12 border-t border-line">
        <div className={column}>
          {needsApproval && inOffice && (
            <div
              className="flex items-center gap-10 mb-10 px-12 py-8 rounded-[8px] border border-state-attention/40 bg-state-attention/10"
              data-testid="conversation-approval"
            >
              <span className="flex-1 text-ui-base font-semibold text-state-attention">
                Claude Code asks for permission.
              </span>
              <UiButton
                variant="primary"
                onClick={() => answerPermission(agentId, true)}
                data-testid="conversation-approve"
              >
                Approve
              </UiButton>
              <UiButton
                onClick={() => answerPermission(agentId, false)}
                data-testid="conversation-deny"
              >
                Deny
              </UiButton>
            </div>
          )}
          {needsApproval && !inOffice && (
            <div className="text-ui-sm text-state-attention mb-8">
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
    </div>
  );
}
