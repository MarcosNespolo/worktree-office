import { REMOTE_CONTROL_NAME_MAX } from './constants.js';

const UNSAFE = /[^\p{L}\p{N} ._-]+/gu;

export function remoteControlName(...parts: Array<string | null | undefined>): string | undefined {
  const name = parts
    .map((part) => (part ?? '').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' - ')
    .slice(0, REMOTE_CONTROL_NAME_MAX)
    .trim();
  return name || undefined;
}
