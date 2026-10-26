import { useState } from 'react';

import { AttachButton, AttachmentList } from './Attachments.js';
import { replyToSession, useReplyState } from './replyStore.js';
import { UiButton } from './ui.js';
import { useAttachments } from './useAttachments.js';

export function ReplyBox({
  agentId,
  hint,
  images = true,
  multiline = false,
  menu = false,
}: {
  agentId: number;
  hint?: string | null;
  images?: boolean;
  multiline?: boolean;
  menu?: boolean;
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
  const blocked = sending !== null || attachments.uploading;
  return (
    <div className="mt-8" onDrop={attachments.onDrop} onDragOver={attachments.onDragOver}>
      <AttachmentList attachments={attachments} />
      {multiline ? (
        <div className="ui-input flex flex-col focus-within:outline-2 focus-within:outline-state-working">
          <textarea
            value={text}
            rows={3}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                send();
              }
            }}
            onPaste={images ? attachments.onPaste : undefined}
            placeholder="Reply. Ctrl+Enter sends."
            className="bg-transparent border-0 outline-none resize-none px-12 pt-10 pb-4 text-ui-base text-ink placeholder:text-ink-faint"
            data-testid="reply-input"
          />
          <div className="flex items-center justify-between gap-8 px-8 pb-8">
            <div>{images && <AttachButton attachments={attachments} />}</div>
            <UiButton variant="primary" size="sm" onClick={send} disabled={blocked}>
              Send
            </UiButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send();
            }}
            onPaste={images ? attachments.onPaste : undefined}
            placeholder={menu ? 'Reply, or 1, 2, 3 for a menu' : 'Reply'}
            className="ui-input flex-1 min-w-0 h-[32px] px-10"
            data-testid="reply-input"
          />
          {images && <AttachButton attachments={attachments} />}
          <UiButton size="sm" onClick={send} disabled={blocked}>
            Send
          </UiButton>
        </div>
      )}
      {hint && (
        <div className="text-ui-xs text-ink-faint leading-snug mt-6" data-testid="reply-hint">
          {hint}
        </div>
      )}
    </div>
  );
}
