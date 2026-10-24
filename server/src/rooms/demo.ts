import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DEMO_BEAT_MS, DEMO_PROJECT, DEMO_WORKTREES } from './constants.js';
import { git } from './git.js';

export interface DemoEnvironment {
  base: string;
  home: string;
  repo: string;
  worktrees: Record<string, string>;
}

type HookEvent = Record<string, unknown>;
type Emit = (event: HookEvent) => void;

interface Beat {
  tool?: string;
  input?: Record<string, unknown>;
  wait?: 'permission' | 'input';
  hold?: number;
}

interface Persona {
  sessionId: string;
  cwd: string;
  beats: Beat[];
  index: number;
  holding: number;
  open: boolean;
}

const DEMO_FILES: Record<string, string> = {
  'README.md': '# acme-shop\n\nA fictional store used by the worktree-office demo.\n',
  'src/cart.ts': 'export const total = (items: number[]) => items.reduce((a, b) => a + b, 0);\n',
  'src/checkout.tsx': 'export function Checkout() {\n  return null;\n}\n',
  'docs/api.md': '# API\n',
};

async function mustGit(args: string[], cwd: string): Promise<void> {
  const result = await git(args, cwd);
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
}

export async function prepareDemo(): Promise<DemoEnvironment> {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-office-demo-'));
  const home = path.join(base, 'home');
  const repo = path.join(base, DEMO_PROJECT);
  fs.mkdirSync(home, { recursive: true });
  for (const [file, content] of Object.entries(DEMO_FILES)) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
  }
  await mustGit(['init', '-q', '-b', 'main'], repo);
  await mustGit(['config', 'user.email', 'demo@example.com'], repo);
  await mustGit(['config', 'user.name', 'Demo'], repo);
  await mustGit(['add', '.'], repo);
  await mustGit(['commit', '-q', '-m', 'Initial commit'], repo);
  const worktrees: Record<string, string> = {};
  for (const { name, branch } of DEMO_WORKTREES) {
    const dir = path.join(base, `${DEMO_PROJECT}-${name}`);
    await mustGit(
      branch
        ? ['worktree', 'add', '-q', '-b', branch, dir]
        : ['worktree', 'add', '-q', '--detach', dir],
      repo,
    );
    worktrees[name] = dir;
  }
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return { base, home, repo, worktrees };
}

export function cleanupDemo(env: DemoEnvironment): void {
  try {
    fs.rmSync(env.base, { recursive: true, force: true });
  } catch {
    return;
  }
}

function file(dir: string, name: string): Record<string, unknown> {
  return { file_path: path.join(dir, name) };
}

function personas(env: DemoEnvironment): Persona[] {
  const wt = env.worktrees;
  const make = (cwd: string, beats: Beat[]): Persona => ({
    sessionId: randomUUID(),
    cwd,
    beats,
    index: 0,
    holding: 0,
    open: false,
  });
  return [
    make(wt['checkout-redesign'], [
      { tool: 'Read', input: file(wt['checkout-redesign'], 'src/checkout.tsx') },
      { tool: 'Edit', input: file(wt['checkout-redesign'], 'src/checkout.tsx'), hold: 2 },
      {
        tool: 'Bash',
        input: { command: 'npm test -- checkout', description: 'Run checkout tests' },
        hold: 2,
      },
      { tool: 'Edit', input: file(wt['checkout-redesign'], 'src/checkout.css') },
    ]),
    make(wt['fix-cart-total'], [
      { tool: 'Read', input: file(wt['fix-cart-total'], 'src/cart.ts') },
      {
        tool: 'Bash',
        input: { command: 'npm run db:migrate', description: 'Run migrations' },
        wait: 'permission',
        hold: 6,
      },
      { tool: 'Edit', input: file(wt['fix-cart-total'], 'src/cart.ts'), hold: 2 },
    ]),
    make(wt['api-docs'], [
      { tool: 'Grep', input: { pattern: 'export function', path: wt['api-docs'] } },
      { tool: 'Read', input: file(wt['api-docs'], 'docs/api.md') },
      { tool: 'Glob', input: { pattern: 'src/**/*.ts', path: wt['api-docs'] } },
      { tool: 'Write', input: file(wt['api-docs'], 'docs/api.md'), hold: 2 },
    ]),
    make(wt['search-filters'], [
      { tool: 'Edit', input: file(wt['search-filters'], 'src/search.ts') },
      { wait: 'input', hold: 8 },
    ]),
    make(env.repo, [
      {
        tool: 'Bash',
        input: {
          command: `gh pr view --json title,state && git -C ${wt['checkout-redesign']} status`,
        },
        hold: 3,
      },
      {
        tool: 'Agent',
        input: {
          description: 'Review the checkout diff',
          subagent_type: 'general-purpose',
          prompt: 'Review it',
        },
        hold: 3,
      },
      {
        tool: 'Bash',
        input: { command: `git fetch --quiet origin && git -C ${wt['release-1-4']} log -1` },
        hold: 3,
      },
      {
        tool: 'Bash',
        input: { command: `npm run lint --silent && git -C ${wt['api-docs']} diff --stat` },
        hold: 3,
      },
    ]),
  ];
}

export class DemoDriver {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly cast: Persona[];

  constructor(
    env: DemoEnvironment,
    private readonly emit: Emit,
  ) {
    this.cast = personas(env);
  }

  start(): void {
    for (const persona of this.cast) {
      this.send(persona, { hook_event_name: 'SessionStart', source: 'startup' });
    }
    this.timer = setInterval(
      () => this.cast.forEach((persona) => this.advance(persona)),
      DEMO_BEAT_MS,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private send(persona: Persona, event: HookEvent): void {
    this.emit({ session_id: persona.sessionId, cwd: persona.cwd, ...event });
  }

  private advance(persona: Persona): void {
    if (persona.holding > 0) {
      persona.holding--;
      return;
    }
    const previous =
      persona.beats[(persona.index + persona.beats.length - 1) % persona.beats.length];
    if (persona.open && previous.tool) {
      this.send(persona, {
        hook_event_name: 'PostToolUse',
        tool_name: previous.tool,
        tool_input: previous.input ?? {},
      });
      persona.open = false;
    }
    const beat = persona.beats[persona.index];
    persona.index = (persona.index + 1) % persona.beats.length;
    persona.holding = beat.hold ?? 0;
    if (beat.tool) {
      this.send(persona, {
        hook_event_name: 'PreToolUse',
        tool_name: beat.tool,
        tool_input: beat.input ?? {},
      });
      persona.open = true;
    }
    if (beat.wait === 'permission') {
      this.send(persona, {
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        message: 'Claude needs your permission to use Bash',
      });
    }
    if (beat.wait === 'input') {
      this.send(persona, {
        hook_event_name: 'Stop',
        last_assistant_message: 'Should the filters live in the URL? Reply yes or no.',
      });
      this.send(persona, {
        hook_event_name: 'Notification',
        notification_type: 'idle_prompt',
        message: 'Claude is waiting for your input',
      });
    }
  }
}
