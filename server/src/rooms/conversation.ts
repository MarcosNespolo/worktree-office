import * as fs from 'fs';

import { CONVERSATION_TAIL_STEPS } from './constants.js';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  at: number | null;
  text: string;
}

export interface Conversation {
  messages: ConversationMessage[];
  truncated: boolean;
}

interface Block {
  type?: string;
  text?: string;
}

interface Record_ {
  type?: string;
  isSidechain?: boolean;
  timestamp?: string;
  message?: { id?: string; content?: unknown };
}

const SKIPPED_USER_PREFIXES = [
  '<task-notification>',
  '<local-command-caveat>',
  '<local-command-stdout>',
  '<command-name>',
  '<command-message>',
  '<system-reminder>',
];
const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const IMAGE_SOURCE = /\[Image: source: [^\]]*\]/g;
const IMAGE_NUMBER = /\[Image #\d+\]/g;

function textOf(content: unknown, role: 'user' | 'assistant'): string {
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? (content as Block[])
            .filter((block) => block.type === 'text' && typeof block.text === 'string')
            .map((block) => block.text as string)
            .join('\n')
        : '';
  const text = raw
    .replace(SYSTEM_REMINDER, '')
    .replace(IMAGE_SOURCE, '[image]')
    .replace(IMAGE_NUMBER, '[image]')
    .trim();
  if (!text) return '';
  if (role === 'user' && SKIPPED_USER_PREFIXES.some((prefix) => text.startsWith(prefix))) return '';
  return text;
}

function readTail(file: string, size: number, bytes: number): string | null {
  const start = Math.max(0, size - bytes);
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      const text = buffer.toString('utf8');
      return start > 0 ? text.slice(text.indexOf('\n') + 1) : text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function parse(text: string): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  let lastAssistantId: string | null = null;
  for (const line of text.split('\n')) {
    if (!line.includes('"message"')) continue;
    let record: Record_;
    try {
      record = JSON.parse(line) as Record_;
    } catch {
      continue;
    }
    if ((record.type !== 'user' && record.type !== 'assistant') || record.isSidechain) continue;
    const role = record.type;
    const body = textOf(record.message?.content, role);
    const id = role === 'assistant' ? (record.message?.id ?? null) : null;
    if (!body) {
      if (role === 'user') lastAssistantId = null;
      continue;
    }
    const at = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
    const previous = messages[messages.length - 1];
    if (role === 'assistant' && id && id === lastAssistantId && previous?.role === 'assistant') {
      previous.text = `${previous.text}\n\n${body}`;
    } else {
      messages.push({ role, at: Number.isFinite(at) ? at : null, text: body });
    }
    lastAssistantId = id;
  }
  return messages;
}

export function readConversation(file: string, limit: number): Conversation {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { messages: [], truncated: false };
  }
  let messages: ConversationMessage[] = [];
  let bytesRead = 0;
  for (const bytes of CONVERSATION_TAIL_STEPS) {
    const text = readTail(file, size, bytes);
    if (text === null) break;
    bytesRead = Math.min(bytes, size);
    messages = parse(text);
    if (messages.length >= limit || bytes >= size) break;
  }
  const truncated = messages.length > limit || bytesRead < size;
  return { messages: messages.slice(-limit), truncated };
}
