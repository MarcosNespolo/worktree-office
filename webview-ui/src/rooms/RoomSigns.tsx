import { useEffect, useState } from 'react';

import type { RoomInfo } from '../../../core/src/messages.js';
import { TILE_SIZE } from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { overlayProjection } from '../office/projection.js';
import type { ToolActivity } from '../office/types.js';
import { collectAgentNeeds } from './agentNeeds.js';
import { requestRelease, useReleaseState } from './releaseStore.js';
import { areaBounds } from './roomGeometry.js';
import { useRoomsState } from './roomsStore.js';
import { roomStage } from './roomStage.js';
import { useSessionsInfo } from './sessionsStore.js';

const SIGN_Z_INDEX = 5;
const SIGN_TOP_OFFSET_PX = 4;

interface RoomSignsProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  agents: number[];
  agentStatuses: Record<number, string>;
  agentAwaitingInput: Record<number, boolean>;
  agentTools: Record<number, ToolActivity[]>;
}

function pullRequestText(room: RoomInfo): string {
  const pr = room.pr;
  if (!pr) return room.branch ? 'no pull request' : 'free';
  if (pr.state === 'merged' || pr.state === 'closed') return `#${pr.number} ${pr.state}`;
  if (pr.review === 'changes-requested') return `#${pr.number} changes requested`;
  if (pr.review === 'approved') return `#${pr.number} approved`;
  return `#${pr.number} ${pr.state === 'draft' ? 'draft' : 'in review'}`;
}

function pullRequestTone(room: RoomInfo): string {
  const pr = room.pr;
  if (!pr) return 'text-text-muted';
  if (pr.state === 'merged') return 'text-accent-bright';
  if (pr.state === 'closed') return 'text-text-muted';
  if (pr.review === 'changes-requested') return 'text-danger';
  if (pr.review === 'approved') return 'text-status-success';
  return 'text-status-active';
}

const CHECKS: Record<string, { text: string; tone: string }> = {
  passing: { text: 'checks ok', tone: 'text-status-success' },
  failing: { text: 'checks failing', tone: 'text-danger' },
  pending: { text: 'checks running', tone: 'text-status-permission' },
};

export function RoomSigns({
  officeState,
  containerRef,
  zoom,
  panRef,
  agents,
  agentStatuses,
  agentAwaitingInput,
  agentTools,
}: RoomSignsProps) {
  const { rooms } = useRoomsState();
  const { busy } = useReleaseState();
  const sessions = useSessionsInfo();
  const needIds = new Set(
    collectAgentNeeds(officeState, agents, agentStatuses, agentAwaitingInput, agentTools).map(
      (need) => need.id,
    ),
  );
  const busyIds = new Set(
    Object.entries(agentTools)
      .filter(([, tools]) => tools.some((tool) => !tool.done))
      .map(([id]) => Number(id)),
  );
  const [, setTick] = useState(0);
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      setTick((n) => n + 1);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const el = containerRef.current;
  if (!el || rooms.length === 0) return null;
  const layout = officeState.getLayout();
  const project = overlayProjection(
    layout,
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    window.devicePixelRatio || 1,
  );
  const bounds = areaBounds(layout);

  return (
    <>
      {rooms.map((room) => {
        const box = bounds.get(room.label);
        if (!box) return null;
        const left = project.toScreenX(box.minCol * TILE_SIZE);
        const width = project.toScreenX((box.maxCol + 1) * TILE_SIZE) - left;
        const top = project.toScreenY(box.minRow * TILE_SIZE) + SIGN_TOP_OFFSET_PX;
        const checks = room.pr?.checks ? CHECKS[room.pr.checks] : null;
        const stage = roomStage(room, { sessions, officeState, needIds, busyIds });
        const fieldValues = Object.values(room.fields);
        return (
          <div
            key={room.label}
            className="absolute flex justify-center pointer-events-none"
            style={{ left, top, width, zIndex: SIGN_Z_INDEX }}
            data-testid="room-sign"
          >
            <div className="pixel-panel px-8 pt-2 pb-4 flex flex-col gap-2 max-w-full overflow-hidden">
              <div className="flex items-center gap-8 whitespace-nowrap text-2xs leading-none">
                {stage && (
                  <span className={`font-bold ${stage.tone}`} data-testid="room-stage">
                    {stage.text}
                  </span>
                )}
                {room.pr ? (
                  <a
                    href={room.pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={room.pr.title}
                    className={`pointer-events-auto no-underline hover:underline ${pullRequestTone(room)}`}
                  >
                    {pullRequestText(room)}
                  </a>
                ) : (
                  <span className={pullRequestTone(room)}>{pullRequestText(room)}</span>
                )}
                {checks && <span className={checks.tone}>{checks.text}</span>}
                {fieldValues.map((value) => (
                  <span key={value} className="text-warning">
                    {value}
                  </span>
                ))}
                {room.port !== null &&
                  (room.devUrl && room.serverUp ? (
                    <a
                      href={room.devUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto no-underline hover:underline text-status-success"
                    >
                      :{room.port}
                    </a>
                  ) : (
                    <span className={room.serverUp ? 'text-status-success' : 'text-text-muted'}>
                      :{room.port}
                    </span>
                  ))}
              </div>
              {(room.branch !== null || room.serverUp) && (
                <div className="flex items-center gap-8 text-2xs leading-none">
                  <span className="flex-1 min-w-0 text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                    {room.branch ?? 'dev server running'}
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => requestRelease(room.label)}
                    title={`Release ${room.label}`}
                    className="pointer-events-auto shrink-0 bg-transparent border-0 p-0 text-2xs leading-none text-accent-bright hover:text-accent cursor-pointer disabled:opacity-(--btn-disabled-opacity) disabled:cursor-default"
                    data-testid="room-release"
                  >
                    {busy === room.label ? 'releasing' : 'release'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
