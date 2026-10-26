import type { SessionInfo } from '../../../core/src/messages.js';
import { terminalHint } from './replyHint.js';
import { openSessionTerminal, useReplyState } from './replyStore.js';
import { selectSession } from './selectionStore.js';
import { UiButton } from './ui.js';

interface TerminalButtonProps {
  agentId: number;
  inOffice: boolean;
  session: SessionInfo | null | undefined;
  label?: string;
  variant?: 'default' | 'primary';
}

export function TerminalButton({
  agentId,
  inOffice,
  session,
  label = 'Terminal',
  variant = 'default',
}: TerminalButtonProps) {
  const { sending } = useReplyState();
  const open = (): void => {
    selectSession(agentId, 'terminal');
    if (!inOffice) openSessionTerminal(agentId);
  };
  return (
    <UiButton
      size="sm"
      variant={variant}
      onClick={open}
      disabled={!inOffice && sending !== null}
      title={inOffice ? 'Open the terminal of this session' : terminalHint(session)}
      data-testid="open-terminal"
    >
      <span className="material-symbols-sharp text-[16px]" aria-hidden="true">
        terminal
      </span>
      {label}
    </UiButton>
  );
}
