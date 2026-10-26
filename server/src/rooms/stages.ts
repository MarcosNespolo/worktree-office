import { STAGE_STICKY_MS } from './constants.js';

export type SessionStage = 'planning' | 'coding' | 'testing' | 'reviewing' | 'reading' | 'working';

export interface StagesConfig {
  testing: RegExp;
  reviewing: RegExp;
}

export interface StageState {
  stage: SessionStage | null;
  stageAt: number | null;
  strong: boolean;
}

interface Classified {
  stage: SessionStage;
  strong: boolean;
}

const CODING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite']);
const BROWSER_TOOL = /chrome|browser|playwright|devtools|puppeteer/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function classifyTool(
  name: string,
  input: unknown,
  config: StagesConfig,
): Classified | null {
  const fields = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (name === 'EnterPlanMode') return { stage: 'planning', strong: true };
  if (name === 'ExitPlanMode') return { stage: 'working', strong: true };
  if (CODING_TOOLS.has(name)) return { stage: 'coding', strong: true };
  if (name === 'Bash') {
    const command = text(fields.command);
    return config.testing.test(command)
      ? { stage: 'testing', strong: true }
      : { stage: 'working', strong: false };
  }
  if (name === 'Agent' || name === 'Task') {
    const about = `${text(fields.description)} ${text(fields.prompt)} ${text(fields.subagent_type)}`;
    return config.reviewing.test(about)
      ? { stage: 'reviewing', strong: true }
      : { stage: 'working', strong: false };
  }
  if (name.startsWith('mcp__') && BROWSER_TOOL.test(name))
    return { stage: 'testing', strong: true };
  if (READING_TOOLS.has(name)) return { stage: 'reading', strong: false };
  return { stage: 'working', strong: false };
}

export function applyStage(state: StageState, next: Classified, at: number): void {
  const current = state.stage;
  const keepStrong =
    state.strong &&
    current !== null &&
    state.stageAt !== null &&
    at - state.stageAt < STAGE_STICKY_MS &&
    !next.strong;
  if (keepStrong) return;
  if (current === 'planning' && state.strong && !next.strong) return;
  state.stage = next.stage;
  state.stageAt = at;
  state.strong = next.strong;
}
