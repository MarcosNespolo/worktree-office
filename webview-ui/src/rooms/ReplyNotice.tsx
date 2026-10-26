import { useEffect } from 'react';

import { dismissReplyResult, useReplyState } from './replyStore.js';

const NOTICE_MS = 8_000;

export function ReplyNotice() {
  const { sending, result, kind } = useReplyState();
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(dismissReplyResult, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [result]);
  if (sending === null && !result) return null;
  return (
    <div
      className="absolute bottom-60 left-1/2 -translate-x-1/2 z-30 ui-panel ui-surface px-16 py-10 text-ui-base max-w-[640px]"
      data-testid="reply-notice"
    >
      {sending !== null && !result ? (
        <span className="text-ink-muted">
          {kind === 'terminal'
            ? 'Opening the session in an office terminal...'
            : 'Sending your reply...'}
        </span>
      ) : (
        <span className={result?.ok ? 'text-state-ready' : 'text-state-failed'}>
          {result?.message}
        </span>
      )}
    </div>
  );
}
