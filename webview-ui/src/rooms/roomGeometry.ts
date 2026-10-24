import type { OfficeLayout } from '../office/types.js';

export interface AreaBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

const cache = new WeakMap<OfficeLayout, Map<string, AreaBounds>>();

export function areaBounds(layout: OfficeLayout): Map<string, AreaBounds> {
  const cached = cache.get(layout);
  if (cached) return cached;
  const bounds = new Map<string, AreaBounds>();
  (layout.areaTiles ?? []).forEach((label, index) => {
    if (!label) return;
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    const box = bounds.get(label);
    if (!box) {
      bounds.set(label, { minCol: col, maxCol: col, minRow: row, maxRow: row });
      return;
    }
    box.minCol = Math.min(box.minCol, col);
    box.maxCol = Math.max(box.maxCol, col);
    box.minRow = Math.min(box.minRow, row);
    box.maxRow = Math.max(box.maxRow, row);
  });
  cache.set(layout, bounds);
  return bounds;
}
