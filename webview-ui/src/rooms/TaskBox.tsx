import { useState } from 'react';

import type { TaskStatus } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { AttachButton, AttachmentList } from './Attachments.js';
import { cancelTask, startTasks, useTasksState } from './tasksStore.js';
import { useAttachments } from './useAttachments.js';

const STATUS_TEXT: Record<TaskStatus, string> = {
  queued: 'queued',
  preparing: 'preparing',
  starting: 'starting',
  blocked: 'needs you',
  running: 'running',
  done: 'done',
  failed: 'failed',
};

const STATUS_TONE: Record<TaskStatus, string> = {
  queued: 'text-text-muted',
  preparing: 'text-status-active',
  starting: 'text-status-active',
  blocked: 'text-status-permission',
  running: 'text-status-success',
  done: 'text-text-muted',
  failed: 'text-danger',
};

function formatTokens(tokens: number): string {
  if (tokens < 1_000) return `${tokens} tok`;
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(tokens < 10_000 ? 1 : 0)}k tok`;
  return `${(tokens / 1_000_000).toFixed(1)}M tok`;
}

export function TaskBox() {
  const { tasks, maxActive, active, splitting } = useTasksState();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const attachments = useAttachments();

  const submit = (): void => {
    if (!text.trim() || splitting || attachments.uploading) return;
    startTasks(text, attachments.paths);
    setText('');
    attachments.clear();
  };

  return (
    <div
      className="absolute top-8 left-1/2 -translate-x-1/2 z-[44] w-[520px] max-w-[calc(100%-120px)] pixel-panel flex flex-col"
      data-testid="task-box"
    >
      <textarea
        value={text}
        rows={open ? 4 : 1}
        onFocus={() => setOpen(true)}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') setOpen(false);
        }}
        onPaste={attachments.onPaste}
        onDrop={attachments.onDrop}
        onDragOver={attachments.onDragOver}
        placeholder="Describe one or more tasks. Separate them with a blank line."
        className="bg-bg-dark text-text text-sm px-8 py-6 border-0 resize-none outline-none font-[inherit]"
        data-testid="task-input"
      />
      <AttachmentList attachments={attachments} />
      {open && (
        <div className="flex items-center justify-between gap-8 px-8 py-4 border-t-2 border-border">
          <span className="text-2xs text-text-muted">
            {splitting
              ? 'Reading your tasks...'
              : attachments.uploading
                ? 'Uploading images...'
                : `${active} of ${maxActive} running. Ctrl+Enter starts.`}
          </span>
          <div className="flex items-center gap-8">
            <AttachButton attachments={attachments} />
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              variant="accent"
              disabled={!text.trim() || splitting || attachments.uploading}
              onClick={submit}
              data-testid="task-start"
            >
              Start
            </Button>
          </div>
        </div>
      )}
      {tasks.length > 0 && (
        <div className="max-h-[180px] overflow-y-auto pixel-scrollbar border-t-2 border-border">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-8 px-8 py-4 border-b border-border text-2xs"
              data-testid="task-row"
            >
              <span className={`shrink-0 ${STATUS_TONE[task.status]}`}>
                {STATUS_TEXT[task.status]}
              </span>
              <span
                className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                title={task.prompt}
              >
                {task.title}
              </span>
              {task.tokens > 0 && (
                <span
                  className="shrink-0 text-text-muted"
                  title="Tokens processed by this task's sessions (input, cache and output)"
                  data-testid="task-tokens"
                >
                  {formatTokens(task.tokens)}
                </span>
              )}
              <span
                className="shrink-0 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-text-muted"
                title={task.detail}
              >
                {task.room ?? task.detail}
              </span>
              {(task.status === 'queued' || task.status === 'done' || task.status === 'failed') && (
                <button
                  type="button"
                  onClick={() => cancelTask(task.id)}
                  className="shrink-0 bg-transparent border-0 p-0 text-2xs text-accent-bright hover:text-accent cursor-pointer"
                >
                  {task.status === 'queued' ? 'cancel' : 'clear'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
