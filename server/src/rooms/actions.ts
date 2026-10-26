import type { ExtraClientMessageHandler } from '../httpServer.js';
import {
  CONVERSATION_DEFAULT_LIMIT,
  CONVERSATION_MAX_LIMIT,
  PERMISSION_ALLOW_KEYS,
  PERMISSION_DENY_KEYS,
} from './constants.js';
import { readConversation } from './conversation.js';
import { parseReleaseRequest, type ReleaseDeps, releaseRoom } from './release.js';
import type { ReplyOutcome } from './reply.js';
import type { SessionInfoTracker } from './sessionInfo.js';
import type { TaskRunner } from './tasks.js';
import { isUploadPath } from './uploads.js';

export interface RoomActionDeps extends ReleaseDeps {
  tasks: TaskRunner;
  sessionInfo: SessionInfoTracker;
  replyToSession: (agentId: number, text: string, images: string[]) => Promise<ReplyOutcome>;
}

function integerOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function imagesOf(msg: Record<string, unknown>): string[] {
  return Array.isArray(msg.images) ? msg.images.filter(isUploadPath) : [];
}

export function createRoomActions(deps: RoomActionDeps): ExtraClientMessageHandler {
  const releasing = new Set<string>();
  const replying = new Set<number>();

  const answer = (msg: Record<string, unknown>, reply: (m: Record<string, unknown>) => void) => {
    if (typeof msg.agentId !== 'number' || typeof msg.text !== 'string') return;
    const agentId = msg.agentId;
    if (replying.has(agentId)) {
      reply({
        type: 'replyResult',
        agentId,
        ok: false,
        message: 'A reply to this session is already on its way.',
      });
      return;
    }
    replying.add(agentId);
    deps
      .replyToSession(agentId, msg.text, imagesOf(msg))
      .then((outcome) => reply({ type: 'replyResult', ...outcome }))
      .catch((err: unknown) =>
        reply({
          type: 'replyResult',
          agentId,
          ok: false,
          message: `Reply failed: ${err instanceof Error ? err.message : String(err)}`,
        }),
      )
      .finally(() => replying.delete(agentId));
  };

  const release = (msg: Record<string, unknown>, reply: (m: Record<string, unknown>) => void) => {
    const request = parseReleaseRequest(msg);
    if (!request) return;
    if (releasing.has(request.label)) {
      reply({
        type: 'releaseResult',
        label: request.label,
        ok: false,
        needs: null,
        message: `${request.label} is already being released.`,
        files: [],
      });
      return;
    }
    releasing.add(request.label);
    releaseRoom(deps, request)
      .then((outcome) => reply(outcome as unknown as Record<string, unknown>))
      .catch((err: unknown) =>
        reply({
          type: 'releaseResult',
          label: request.label,
          ok: false,
          needs: null,
          message: `Release failed: ${err instanceof Error ? err.message : String(err)}`,
          files: [],
        }),
      )
      .finally(() => releasing.delete(request.label));
  };

  return (msg, reply) => {
    switch (msg.type) {
      case 'webviewReady':
        reply(deps.status.snapshot() as unknown as Record<string, unknown>);
        reply(deps.tasks.snapshot() as unknown as Record<string, unknown>);
        reply(deps.sessionInfo.snapshot() as unknown as Record<string, unknown>);
        return false;
      case 'releaseRoom':
        release(msg, reply);
        return true;
      case 'startTasks':
        if (typeof msg.text === 'string') void deps.tasks.add(msg.text, imagesOf(msg));
        return true;
      case 'cancelTask':
        if (typeof msg.id === 'string') deps.tasks.cancel(msg.id);
        return true;
      case 'replyToSession':
        answer(msg, reply);
        return true;
      case 'sendToAgent':
        if (typeof msg.agentId === 'number' && typeof msg.text === 'string') {
          deps.tasks.send(msg.agentId, msg.text);
        }
        return true;
      case 'answerPermission':
        if (typeof msg.agentId === 'number' && typeof msg.allow === 'boolean') {
          if (msg.allow) deps.tasks.send(msg.agentId, PERMISSION_ALLOW_KEYS);
          else deps.tasks.press(msg.agentId, PERMISSION_DENY_KEYS);
        }
        return true;
      case 'getSessionMessages': {
        if (typeof msg.agentId !== 'number') return true;
        const limit = Math.min(
          CONVERSATION_MAX_LIMIT,
          Math.max(1, integerOr(msg.limit, CONVERSATION_DEFAULT_LIMIT)),
        );
        const file = deps.store.get(msg.agentId)?.jsonlFile ?? '';
        const conversation = file
          ? readConversation(file, limit)
          : { messages: [], truncated: false };
        reply({ type: 'sessionMessages', agentId: msg.agentId, ...conversation });
        return true;
      }
      default:
        return false;
    }
  };
}
