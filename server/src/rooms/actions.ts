import type { ExtraClientMessageHandler } from '../httpServer.js';
import { parseReleaseRequest, type ReleaseDeps, releaseRoom } from './release.js';

export function createRoomActions(deps: ReleaseDeps): ExtraClientMessageHandler {
  const releasing = new Set<string>();
  return (msg, reply) => {
    if (msg.type !== 'releaseRoom') return false;
    const request = parseReleaseRequest(msg);
    if (!request) return true;
    if (releasing.has(request.label)) {
      reply({
        type: 'releaseResult',
        label: request.label,
        ok: false,
        needs: null,
        message: `${request.label} is already being released.`,
        files: [],
      });
      return true;
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
    return true;
  };
}
