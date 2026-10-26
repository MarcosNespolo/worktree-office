import { useEffect, useRef } from 'react';

import {
  answerPermission,
  openConversation,
  refreshConversation,
  useConversation,
} from './conversationStore.js';
import { Markdown } from './markdown.js';
import { ReplyBox } from './ReplyBox.js';
import { replyHint } from './replyHint.js';
import { useReplyState } from './replyStore.js';
import { useSessionsInfo } from './sessionsStore.js';
import { UiButton } from './ui.js';

const REFRESH_AFTER_REPLY_MS = 3_000;

interface ConversationViewProps {
  agentId: number;
  inOffice: boolean;
  needsApproval: boolean;
  full: boolean;
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

export function ConversationView({
  agentId,
  inOffice,
  needsApproval,
  full,
}: ConversationViewProps) {
  const conversation = useConversation();
  const sessions = useSessionsInfo();
  const { result, sentTo } = useReplyState();
  const session = sessions.get(agentId);
  const lastActivityAt = session?.lastActivityAt ?? null;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openConversation(agentId);
  }, [agentId]);

  useEffect(() => {
    refreshConversation();
  }, [lastActivityAt]);

  useEffect(() => {
    if (!result?.ok || sentTo !== agentId || result.agentId !== agentId) return;
    const timer = setTimeout(refreshConversation, REFRESH_AFTER_REPLY_MS);
    return () => clearTimeout(timer);
  }, [result, sentTo, agentId]);

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [conversation.loadedAt]);

  const mine = conversation.agentId === agentId;
  const messages = mine ? conversation.messages : [];
  const loading = !mine || conversation.loading;
  const column = full ? 'w-full max-w-[780px] mx-auto' : '';

  return (
    <>
      <div
        ref={scroller}
        className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar px-20 py-16"
        data-testid="conversation-messages"
      >
        <div className={`${column} flex flex-col gap-20`}>
          {mine && conversation.truncated && (
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
    </>
  );
}
