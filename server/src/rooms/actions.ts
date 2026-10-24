import type { ExtraClientMessageHandler } from '../httpServer.js';
import { parseReleaseRequest, type ReleaseDeps, releaseRoom } from './release.js';
import type { TaskRunner } from './tasks.js';

export interface RoomActionDeps extends ReleaseDeps {
  tasks: TaskRunner;
}

export function createRoomActions(deps: RoomActionDeps): ExtraClientMessageHandler {
  const releasing = new Set<string>();

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
      case 'releaseRoom':
        release(msg, reply);
        return true;
      case 'startTasks':
        if (typeof msg.text === 'string') void deps.tasks.add(msg.text);
        return true;
      case 'cancelTask':
        if (typeof msg.id === 'string') deps.tasks.cancel(msg.id);
        return true;
      case 'sendToAgent':
        if (typeof msg.agentId === 'number' && typeof msg.text === 'string') {
          deps.tasks.send(msg.agentId, msg.text);
        }
        return true;
      default:
        return false;
    }
  };
}
