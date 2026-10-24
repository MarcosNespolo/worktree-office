import type { AgentStateStore } from '../agentStateStore.js';
import { directoryNameFor } from '../hostDirectory.js';
import type { AgentState } from '../types.js';
import { toForwardSlashes } from './glob.js';
import type { RoomsManager } from './manager.js';
import type { Room } from './rooms.js';

interface SessionTrace {
  cwd?: string;
  toolRoom?: string;
}

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PATH_END = /^($|[\\/"'`\s;&|)])/;

function fold(text: string): string {
  return process.platform === 'win32' ? text.toLowerCase() : text;
}

function pathForms(roomPath: string): string[] {
  const forward = fold(toForwardSlashes(roomPath));
  const drive = /^([a-z]):\//i.exec(forward);
  return drive ? [forward, `/${drive[1].toLowerCase()}/${forward.slice(3)}`] : [forward];
}

function mentions(text: string, needle: string): boolean {
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    if (PATH_END.test(text.slice(at + needle.length, at + needle.length + 1))) return true;
  }
  return false;
}

export function roomsMentioned(command: string, rooms: readonly Room[]): Room[] {
  const text = fold(toForwardSlashes(command));
  return rooms.filter((room) => pathForms(room.path).some((form) => mentions(text, form)));
}

export function roomFromTool(
  toolName: unknown,
  input: unknown,
  rooms: readonly Room[],
  roomFor: (filePath: string) => Room | null,
): Room | null {
  if (typeof toolName !== 'string' || !input || typeof input !== 'object') return null;
  const fields = input as Record<string, unknown>;
  if (FILE_TOOLS.has(toolName)) {
    const file = fields.file_path ?? fields.notebook_path;
    return typeof file === 'string' ? roomFor(file) : null;
  }
  if (toolName === 'Bash' && typeof fields.command === 'string') {
    const found = roomsMentioned(fields.command, rooms);
    return found.length === 1 ? found[0] : null;
  }
  return null;
}

export class SessionFollower {
  private readonly traces = new Map<string, SessionTrace>();

  constructor(
    private readonly store: AgentStateStore,
    private readonly rooms: RoomsManager,
  ) {
    store.on('agentAdded', (_id, agent) => this.apply(agent));
    rooms.onChange(() => {
      for (const agent of this.store.values()) this.apply(agent);
    });
  }

  observe(event: Record<string, unknown>): void {
    const sessionId = typeof event.session_id === 'string' ? event.session_id : '';
    if (!sessionId) return;
    if (event.hook_event_name === 'SessionEnd') {
      this.traces.delete(sessionId);
      return;
    }
    const trace = this.traces.get(sessionId) ?? {};
    if (typeof event.cwd === 'string' && event.cwd) trace.cwd = event.cwd;
    if (event.hook_event_name === 'PreToolUse') {
      const room = roomFromTool(event.tool_name, event.tool_input, this.rooms.current, (p) =>
        this.rooms.roomFor(p),
      );
      if (room && this.rooms.followsToolPaths(room)) trace.toolRoom = room.label;
    }
    this.traces.set(sessionId, trace);
    for (const agent of this.store.values()) {
      if (agent.sessionId === sessionId) this.apply(agent);
    }
  }

  private desiredDirectory(agent: AgentState): string | undefined {
    const trace = this.traces.get(agent.sessionId);
    if (!trace) return undefined;
    const cwdRoom = this.rooms.roomFor(trace.cwd);
    if (cwdRoom) return cwdRoom.label;
    if (trace.toolRoom && this.rooms.current.some((room) => room.label === trace.toolRoom)) {
      return trace.toolRoom;
    }
    return trace.cwd ? directoryNameFor(trace.cwd) : undefined;
  }

  private apply(agent: AgentState): void {
    if (agent.leadAgentId !== undefined) return;
    const directoryName = this.desiredDirectory(agent);
    if (!directoryName || directoryName === agent.directoryName) return;
    agent.directoryName = directoryName;
    this.store.broadcast({ type: 'agentDirectoryChanged', id: agent.id, directoryName });
  }
}
