import type { SessionInfo } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { terminalHint } from './replyHint.js';
import { openSessionTerminal, useReplyState } from './replyStore.js';

interface TerminalButtonProps {
  agentId: number;
  inOffice: boolean;
  session: SessionInfo | null | undefined;
  onReveal: (agentId: number) => void;
  onLeave?: () => void;
}

export function TerminalButton({
  agentId,
  inOffice,
  session,
  onReveal,
  onLeave,
}: TerminalButtonProps) {
  const { sending } = useReplyState();
  const open = (): void => {
    onLeave?.();
    if (inOffice) onReveal(agentId);
    else openSessionTerminal(agentId);
  };
  return (
    <Button
      size="sm"
      onClick={open}
      disabled={!inOffice && sending !== null}
      title={inOffice ? 'Open the terminal of this session' : terminalHint(session)}
      data-testid="open-terminal"
    >
      Terminal
    </Button>
  );
}
