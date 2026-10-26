import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { AttachButton, AttachmentList } from './Attachments.js';
import { replyToSession, useReplyState } from './replyStore.js';
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
  const fieldClass =
    'flex-1 min-w-0 bg-bg-dark text-text text-sm px-6 py-2 border-2 border-border outline-none font-[inherit]';
  return (
    <div className="mt-4" onDrop={attachments.onDrop} onDragOver={attachments.onDragOver}>
      <AttachmentList attachments={attachments} />
      <div className="flex items-center gap-6">
        {multiline ? (
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
            className={`${fieldClass} resize-none`}
            data-testid="reply-input"
          />
        ) : (
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send();
            }}
            onPaste={images ? attachments.onPaste : undefined}
            placeholder={menu ? 'Reply, or 1, 2, 3 for a menu' : 'Reply'}
            className={fieldClass}
            data-testid="reply-input"
          />
        )}
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
