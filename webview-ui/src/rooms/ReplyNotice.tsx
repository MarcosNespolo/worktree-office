import { useEffect } from 'react';

import { dismissReplyResult, useReplyState } from './replyStore.js';

const NOTICE_MS = 8_000;

export function ReplyNotice() {
  const { sending, result } = useReplyState();
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(dismissReplyResult, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [result]);
  if (sending === null && !result) return null;
  return (
    <div
      className="absolute bottom-60 left-1/2 -translate-x-1/2 z-30 pixel-panel px-14 py-8 text-base max-w-[640px]"
      data-testid="reply-notice"
    >
      {sending !== null && !result ? (
        <span className="text-text-muted">Sending your reply...</span>
      ) : (
        <span className={result?.ok ? 'text-status-success' : 'text-danger'}>
          {result?.message}
        </span>
      )}
    </div>
  );
}
