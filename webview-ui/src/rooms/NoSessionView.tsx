import type { TaskInfo } from '../../../core/src/messages.js';
import { Markdown } from './markdown.js';
import { cancelTask } from './tasksStore.js';
import { UiButton } from './ui.js';

const STATUS_TEXT: Record<string, string> = {
  queued: 'Waiting for a free worktree and a free slot.',
  preparing: 'Preparing a worktree.',
  starting: 'Starting Claude Code.',
  blocked: 'Waiting for you in its terminal.',
  failed: 'Could not start.',
};

export function NoSessionView({
  task,
  prUrl,
}: {
  task: TaskInfo | undefined;
  prUrl: string | null;
}) {
  if (task && task.agentId === null) {
    const canCancel = task.status === 'queued';
    const canClear = task.status === 'failed' || task.status === 'done';
    return (
      <div className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar px-20 py-16 flex flex-col gap-14">
        <div className="text-ui-base text-ink-muted">
          {STATUS_TEXT[task.status] ?? task.status}
          {task.detail ? ` ${task.detail}` : ''}
        </div>
        <div className="bg-surface-raised border border-line rounded-[12px] px-14 py-10">
          <Markdown text={task.prompt} />
        </div>
        {(canCancel || canClear) && (
          <div>
            <UiButton onClick={() => cancelTask(task.id)} data-testid="task-cancel">
              {canCancel ? 'Cancel task' : 'Clear'}
            </UiButton>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 px-24 text-center">
      <div className="text-ui-md font-semibold">No session is working in this room.</div>
      <div className="text-ui-sm text-ink-muted max-w-[440px]">
        Its branch and pull request stay as they are. Start a new task to work here again, or
        release the room when you are done with it.
      </div>
      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ui-sm text-link hover:underline"
        >
          Open the pull request
        </a>
      )}
    </div>
  );
}
