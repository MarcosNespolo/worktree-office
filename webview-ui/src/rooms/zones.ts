import type { OfficeLayout } from '../office/types.js';

export interface ZoneTile {
  col: number;
  row: number;
}

export function groupTilesByZone(
  tiles: readonly ZoneTile[],
  layout: OfficeLayout,
): Map<string | null, ZoneTile[]> {
  const zones = new Map<string | null, ZoneTile[]>();
  for (const tile of tiles) {
    const label = layout.areaTiles?.[tile.row * layout.cols + tile.col] ?? null;
    const list = zones.get(label);
    if (list) list.push(tile);
    else zones.set(label, [tile]);
  }
  return zones;
}
