import type { SessionInfo } from '../../../core/src/messages.js';

const APP_NAMES: Record<string, string> = {
  'claude-vscode': 'VS Code',
  'claude-desktop': 'the Claude app',
  cli: 'another terminal',
};

export function replyHint(
  session: SessionInfo | null | undefined,
  inOffice: boolean,
): string | null {
  if (inOffice) return null;
  const app = session?.app ? APP_NAMES[session.app] : undefined;
  return app
    ? `Replying moves this conversation from ${app} to an office terminal. Answer it only here from then on.`
    : 'Replying continues this conversation in an office terminal.';
}
