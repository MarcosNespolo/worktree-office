import type { PtySession } from '../terminal/ptySessionManager.js';
import { TASK_SUBMIT_DELAY_MS } from './constants.js';

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const PASTE_START = `${ESC}[200~`;
const PASTE_END = `${ESC}[201~`;
const ANSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^${BEL}]*${BEL}`, 'g');

export const READY =
  /❯Try"|\?forshortcuts|(?:bypasspermissions|acceptedits|planmode|automode)on|shift\+tabtocycle/i;
export const TRUST = /trustthisfolder|doyoutrust|trustthefiles|quicksafetycheck/i;

export function plainText(screen: string): string {
  return screen.replace(ANSI, '').replace(/\s+/g, '');
}

export function typeInto(session: PtySession, text: string): void {
  session.write(`${PASTE_START}${text}${PASTE_END}`);
  setTimeout(() => session.write('\r'), TASK_SUBMIT_DELAY_MS);
}

export function sendKeysOrText(session: PtySession, text: string): void {
  const trimmed = text.trim();
  if (/^\S{1,3}$/.test(trimmed)) {
    session.write(trimmed);
    setTimeout(() => session.write('\r'), TASK_SUBMIT_DELAY_MS);
  } else {
    typeInto(session, text);
  }
}
