import { useEffect, useState } from 'react';

import { TILE_SIZE } from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { overlayProjection } from '../office/projection.js';
import type { ColorValue, ToolActivity } from '../office/types.js';
import { shownBytes } from './memory.js';
import { useReleaseState } from './releaseStore.js';
import { areaBounds } from './roomGeometry.js';
import { useRoomsState } from './roomsStore.js';
import { selectTarget, useSelection } from './selectionStore.js';
import { findItem, targetOf, useWorkItems, type WorkItem } from './workItems.js';
import { STATE_COLOR, STATE_LABEL, type WorkState } from './workState.js';

const SIGN_Z_INDEX = 5;
const FRAME_Z_INDEX = 4;
const SIGN_TOP_OFFSET_PX = 6;
const FREE_STATE: WorkState = 'idle';

const STATE_VAR: Record<WorkState, string> = {
  attention: '--color-state-attention',
  working: '--color-state-working',
  ready: '--color-state-ready',
  idle: '--color-state-idle',
  failed: '--color-state-failed',
  queued: '--color-state-idle',
};

const STATE_FLOOR: Record<WorkState, ColorValue> = {
  attention: { h: 40, s: 50, b: -32, c: -80 },
  working: { h: 214, s: 42, b: -28, c: -80 },
  ready: { h: 135, s: 30, b: -38, c: -82 },
  idle: { h: 230, s: 6, b: -30, c: -70 },
  failed: { h: 2, s: 48, b: -34, c: -82 },
  queued: { h: 230, s: 6, b: -30, c: -70 },
};

const CHECKS_ICON: Record<string, { icon: string; color: string; title: string }> = {
  passing: { icon: 'check_circle', color: STATE_COLOR.ready, title: 'Checks passing' },
  failing: { icon: 'cancel', color: STATE_COLOR.failed, title: 'Checks failing' },
  pending: { icon: 'pending', color: STATE_COLOR.attention, title: 'Checks running' },
};

function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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
  const selection = useSelection();
  const { items } = useWorkItems(
    officeState,
    agents,
    agentStatuses,
    agentAwaitingInput,
    agentTools,
  );
  const itemByRoom = new Map<string, WorkItem>();
  for (const item of items) if (item.room) itemByRoom.set(item.room, item);
  const colorKey = rooms
    .map((room) => `${room.label}=${itemByRoom.get(room.label)?.view.state ?? FREE_STATE}`)
    .join('|');

  useEffect(() => {
    const colors = new Map<string, string>();
    const floors = new Map<string, ColorValue>();
    for (const entry of colorKey.split('|')) {
      if (!entry) continue;
      const split = entry.lastIndexOf('=');
      const label = entry.slice(0, split);
      const state = entry.slice(split + 1) as WorkState;
      const color = cssColor(STATE_VAR[state]);
      if (color) colors.set(label, color);
      floors.set(label, STATE_FLOOR[state]);
    }
    officeState.setAreaColors(colors, floors);
  }, [colorKey, officeState]);

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
  const roomOfAgent =
    selection.agentId === null
      ? null
      : (officeState.characters.get(selection.agentId)?.directoryName ?? null);
  const selected = selection.open ? findItem(items, selection, roomOfAgent) : undefined;

  return (
    <>
      {rooms.map((room) => {
        const box = bounds.get(room.label);
        if (!box) return null;
        const left = project.toScreenX(box.minCol * TILE_SIZE);
        const width = project.toScreenX((box.maxCol + 1) * TILE_SIZE) - left;
        const floorTop = project.toScreenY(box.minRow * TILE_SIZE);
        const height = project.toScreenY((box.maxRow + 1) * TILE_SIZE) - floorTop;
        const item = itemByRoom.get(room.label);
        const state = item?.view.state ?? null;
        const color = state ? STATE_COLOR[state] : 'var(--color-ink-faint)';
        const checks = room.pr?.checks ? CHECKS_ICON[room.pr.checks] : undefined;
        const isSelected = selected !== undefined && selected.room === room.label;
        const releasing = busy === room.label;
        const memory = shownBytes(room.memoryBytes);
        return (
          <div key={room.label}>
            {item && (
              <div
                className={`absolute pointer-events-none rounded-[3px] ${state === 'attention' ? 'room-frame-attention' : ''}`}
                style={{
                  left,
                  top: floorTop,
                  width,
                  height,
                  boxShadow: `inset 0 0 0 ${isSelected ? 3 : 2}px ${color}`,
                  zIndex: FRAME_Z_INDEX,
                }}
                data-testid="room-frame"
                data-state={state ?? 'free'}
              />
            )}
            <div
              className="absolute flex justify-center pointer-events-none"
              style={{ left, top: floorTop + SIGN_TOP_OFFSET_PX, width, zIndex: SIGN_Z_INDEX }}
              data-testid="room-sign"
              data-state={state ?? 'free'}
            >
              <button
                type="button"
                disabled={!item}
                onClick={() => item && selectTarget(targetOf(item))}
                className="ui-surface room-sign pointer-events-auto min-w-0 max-w-[calc(100%-12px)] rounded-[8px] border bg-surface/90 px-10 py-6 text-left cursor-pointer disabled:cursor-default"
                style={{
                  borderColor: color,
                  boxShadow: isSelected ? `0 0 0 2px ${color}` : undefined,
                }}
                title={item ? 'Open this task' : undefined}
              >
                <div className="text-ui-sm font-semibold text-ink truncate">
                  {item?.title ?? room.label}
                </div>
                <div className="flex items-center gap-6 mt-2 text-ui-xs whitespace-nowrap">
                  {item && state ? (
                    <>
                      <span
                        className="w-[7px] h-[7px] rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span
                        className="font-semibold truncate"
                        style={{ color }}
                        data-testid="room-stage"
                      >
                        {releasing
                          ? 'Releasing'
                          : `${STATE_LABEL[state]}${item.view.detail ? ` · ${item.view.detail}` : ''}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-faint" data-testid="room-stage">
                      free{room.port !== null ? ` · :${room.port}` : ''}
                    </span>
                  )}
                  {(room.pr || memory) && (
                    <span className="ml-auto pl-6 inline-flex items-center gap-6 text-ink-muted shrink-0">
                      {memory && (
                        <span title="RAM in use" data-testid="room-memory">
                          {memory}
                        </span>
                      )}
                      {room.pr && (
                        <span className="inline-flex items-center gap-3">
                          #{room.pr.number}
                          {checks && (
                            <span
                              className="material-symbols-sharp text-[14px]"
                              style={{ color: checks.color }}
                              title={checks.title}
                              aria-label={checks.title}
                            >
                              {checks.icon}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
