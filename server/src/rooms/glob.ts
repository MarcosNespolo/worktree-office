import * as path from 'path';

import { expandTilde } from '../directories.js';

const REGEX_SPECIALS = /[.+^${}()|[\]\\]/g;

export function toForwardSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = toForwardSlashes(path.resolve(expandTilde(pattern)));
  let source = '';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '*' && normalized[i + 1] === '*') {
      source += '.*';
      i++;
    } else if (ch === '*') {
      source += '[^/]*';
    } else if (ch === '?') {
      source += '[^/]';
    } else {
      source += ch.replace(REGEX_SPECIALS, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, process.platform === 'win32' ? 'i' : '');
}

export function matchesAny(filePath: string, patterns: readonly RegExp[]): boolean {
  const candidate = toForwardSlashes(filePath);
  return patterns.some((re) => re.test(candidate));
}
