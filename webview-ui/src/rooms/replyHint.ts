import type { SessionInfo } from '../../../core/src/messages.js';

const APP_NAMES: Record<string, string> = {
  'claude-vscode': 'VS Code',
  'claude-desktop': 'the Claude app',
  cli: 'another terminal',
};

function appOf(session: SessionInfo | null | undefined): string | undefined {
  return session?.app ? APP_NAMES[session.app] : undefined;
}

export function replyHint(
  session: SessionInfo | null | undefined,
  inOffice: boolean,
): string | null {
  if (inOffice) return null;
  const app = appOf(session);
  return app
    ? `Replying moves this conversation from ${app} to an office terminal. Answer it only here from then on.`
    : 'Replying continues this conversation in an office terminal.';
}

export function terminalHint(session: SessionInfo | null | undefined): string {
  const app = appOf(session);
  return app
    ? `Moves this conversation from ${app} to an office terminal. Use it only there from then on.`
    : 'Continues this conversation in an office terminal.';
}
