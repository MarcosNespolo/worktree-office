import { useEffect, useRef, useState } from 'react';

import { AttachButton, AttachmentList } from './Attachments.js';
import { startTasks, useTasksState } from './tasksStore.js';
import { IconButton, UiButton } from './ui.js';
import { useAttachments } from './useAttachments.js';

export function NewTaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { maxActive, active, splitting, freeRooms } = useTasksState();
  const attachments = useAttachments();
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) return null;
  const capacity = splitting
    ? 'Reading your tasks...'
    : attachments.uploading
      ? 'Uploading images...'
      : `${active} of ${maxActive} running · ${
          freeRooms.length > 0 ? `free: ${freeRooms.join(', ')}` : 'no free worktree'
        }`;
  const blocked = !text.trim() || splitting || attachments.uploading;

  const submit = (): void => {
    if (blocked) return;
    startTasks(text, attachments.paths);
    setText('');
    attachments.clear();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] bg-black/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="new-task-dialog"
    >
      <div
        className="w-[680px] max-w-[calc(100vw-32px)] ui-panel ui-surface flex flex-col"
        onDrop={attachments.onDrop}
        onDragOver={attachments.onDragOver}
      >
        <div className="flex items-center gap-8 px-16 pt-14 pb-8">
          <span className="flex-1 text-ui-lg font-semibold">New task</span>
          <IconButton icon="close" label="Close (Esc)" onClick={onClose} />
        </div>
        <div className="px-16">
          <textarea
            ref={input}
            value={text}
            rows={8}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit();
              }
              if (event.key === 'Escape') onClose();
            }}
            onPaste={attachments.onPaste}
            placeholder="Describe one or more tasks. Separate them with a blank line, or write them as a list."
            className="ui-input w-full resize-none px-12 py-10 text-ui-md"
            data-testid="task-input"
          />
          <AttachmentList attachments={attachments} />
        </div>
        <div className="flex items-center gap-10 px-16 pt-8 pb-14">
          <AttachButton attachments={attachments} />
          <span className="flex-1 min-w-0 truncate text-ui-xs text-ink-muted" title={capacity}>
            {capacity}
          </span>
          <span className="text-ui-xs text-ink-faint">Ctrl+Enter</span>
          <UiButton variant="primary" disabled={blocked} onClick={submit} data-testid="task-start">
            Start
          </UiButton>
        </div>
      </div>
    </div>
  );
}
