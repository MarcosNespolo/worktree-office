import { spawn } from 'child_process';

import { TASK_SPLIT_TIMEOUT_MS, TASK_TITLE_MAX } from './constants.js';

export interface TaskDraft {
  title: string;
  prompt: string;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

export function titleOf(prompt: string): string {
  const firstLine = prompt.split('\n').find((line) => line.trim()) ?? prompt;
  const clean = firstLine.replace(BULLET, '').trim();
  return clean.length > TASK_TITLE_MAX ? `${clean.slice(0, TASK_TITLE_MAX - 3)}...` : clean;
}

export function splitByLines(text: string): TaskDraft[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  let items = blocks;
  if (blocks.length === 1) {
    const lines = blocks[0].split('\n').filter((line) => line.trim());
    if (lines.length >= 2 && lines.every((line) => BULLET.test(line))) {
      items = lines.map((line) => line.replace(BULLET, '').trim());
    }
  }
  return items.map((prompt) => ({ title: titleOf(prompt), prompt }));
}

const SPLIT_INSTRUCTION = [
  'Split the text after the line "---" into independent software tasks.',
  'Keep the wording of each task and do not add work that is not there.',
  'Reply with JSON only, in this shape: {"tasks":[{"title":"short title","prompt":"full task text"}]}',
  '---',
].join('\n');

function parseClaudeTasks(stdout: string): TaskDraft[] | null {
  try {
    const envelope = JSON.parse(stdout) as { result?: unknown };
    const text = typeof envelope.result === 'string' ? envelope.result : stdout;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { tasks?: unknown };
    if (!Array.isArray(parsed.tasks)) return null;
    const drafts = (parsed.tasks as Array<Record<string, unknown>>)
      .filter((task) => typeof task.prompt === 'string' && task.prompt.trim())
      .map((task) => {
        const prompt = String(task.prompt).trim();
        const title = typeof task.title === 'string' && task.title.trim() ? task.title.trim() : '';
        return { title: title ? titleOf(title) : titleOf(prompt), prompt };
      });
    return drafts.length > 0 ? drafts : null;
  } catch {
    return null;
  }
}

export function splitWithClaude(text: string, cwd: string): Promise<TaskDraft[] | null> {
  return new Promise((resolve) => {
    const windows = process.platform === 'win32';
    const child = spawn(
      windows ? (process.env.ComSpec ?? 'cmd.exe') : 'claude',
      windows
        ? ['/d', '/c', 'claude', '-p', '--output-format', 'json']
        : ['-p', '--output-format', 'json'],
      { cwd, windowsHide: true },
    );
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, TASK_SPLIT_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(parseClaudeTasks(stdout));
    });
    child.stdin.end(`${SPLIT_INSTRUCTION}\n${text}`);
  });
}

export async function splitTasks(
  text: string,
  mode: 'lines' | 'claude',
  cwd: string,
): Promise<TaskDraft[]> {
  if (mode === 'claude') {
    const drafts = await splitWithClaude(text, cwd);
    if (drafts) return drafts;
  }
  return splitByLines(text);
}
