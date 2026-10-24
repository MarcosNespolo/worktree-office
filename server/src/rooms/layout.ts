import {
  AREA_HUE_START,
  AREA_HUE_STEP,
  AREA_LIGHTNESS,
  AREA_SATURATION,
  FLOOR_COLORS,
  FLOOR_LOBBY,
  FLOOR_ROOM_A,
  FLOOR_ROOM_B,
  type FurniturePlacement,
  LAYOUT_REVISION,
  LAYOUT_TOP_PADDING,
  LOBBY_INNER_ROWS,
  LOBBY_LOUNGE,
  LOBBY_LOUNGE_OFFSET_COL,
  LOBBY_LOUNGE_OFFSET_ROW,
  LOBBY_ONLY_COLUMNS,
  ROOM_BOTTOM_DOOR_COL,
  ROOM_FURNITURE,
  ROOM_HEIGHT,
  ROOM_SIDE_DOOR_ROWS,
  ROOM_WALL_DECOR,
  ROOM_WIDTH,
  ROOMS_MAX_COLUMNS,
  TILE_VOID,
  TILE_WALL,
  type TileColor,
  WALL_COLOR,
} from './constants.js';

export interface PlacedFurniture {
  uid: string;
  type: string;
  col: number;
  row: number;
}

export interface GeneratedLayout {
  version: 1;
  cols: number;
  rows: number;
  layoutRevision: number;
  tiles: number[];
  tileColors: Array<TileColor | null>;
  furniture: PlacedFurniture[];
  areas: Array<{ label: string; color: string }>;
  areaTiles: Array<string | null>;
}

export interface RoomBox {
  label: string;
  left: number;
  top: number;
}

export interface LayoutPlan {
  layout: GeneratedLayout;
  boxes: RoomBox[];
  lobbyTop: number;
}

function hashLabel(label: string): number {
  let hash = 5381;
  for (let i = 0; i < label.length; i++) hash = ((hash << 5) + hash + label.charCodeAt(i)) >>> 0;
  return hash;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const k = (n: number): number => (n + hue / 30) % 12;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number): string =>
    Math.round(255 * (lightness - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function areaColor(label: string): string {
  const hue = (AREA_HUE_START + (hashLabel(label) % 360) * AREA_HUE_STEP) % 360;
  return hslToHex(hue, AREA_SATURATION, AREA_LIGHTNESS);
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'room'
  );
}

export function planRoomsLayout(labels: readonly string[]): LayoutPlan {
  const count = labels.length;
  const gridRows = Math.ceil(count / ROOMS_MAX_COLUMNS);
  const gridCols = count === 0 ? LOBBY_ONLY_COLUMNS : Math.ceil(count / gridRows);
  const cols = gridCols * ROOM_WIDTH + 1;
  const lobbyTop = LAYOUT_TOP_PADDING + gridRows * ROOM_HEIGHT;
  const rows = lobbyTop + 1 + LOBBY_INNER_ROWS;

  const tiles = new Array<number>(cols * rows).fill(TILE_VOID);
  const tileColors = new Array<TileColor | null>(cols * rows).fill(null);
  const areaTiles = new Array<string | null>(cols * rows).fill(null);
  const furniture: PlacedFurniture[] = [];
  const index = (col: number, row: number): number => row * cols + col;

  const wall = (col: number, row: number): void => {
    tiles[index(col, row)] = TILE_WALL;
    tileColors[index(col, row)] = { ...WALL_COLOR };
    areaTiles[index(col, row)] = null;
  };
  const floor = (col: number, row: number, pattern: number, label: string | null): void => {
    tiles[index(col, row)] = pattern;
    tileColors[index(col, row)] = { ...FLOOR_COLORS[pattern] };
    areaTiles[index(col, row)] = label;
  };
  const place = (
    prefix: string,
    items: readonly FurniturePlacement[],
    left: number,
    top: number,
  ): void => {
    items.forEach(([type, dc, dr], n) => {
      furniture.push({ uid: `${prefix}-${n + 1}`, type, col: left + dc, row: top + dr });
    });
  };

  const boxes: RoomBox[] = labels.map((label, i) => ({
    label,
    left: (i % gridCols) * ROOM_WIDTH,
    top: LAYOUT_TOP_PADDING + Math.floor(i / gridCols) * ROOM_HEIGHT,
  }));

  boxes.forEach((box, i) => {
    const gridRow = Math.floor(i / gridCols);
    const gridCol = i % gridCols;
    const pattern = (gridRow + gridCol) % 2 === 0 ? FLOOR_ROOM_A : FLOOR_ROOM_B;
    for (let c = box.left; c <= box.left + ROOM_WIDTH; c++) {
      wall(c, box.top);
      wall(c, box.top + ROOM_HEIGHT);
    }
    for (let r = box.top + 1; r < box.top + ROOM_HEIGHT; r++) {
      wall(box.left, r);
      wall(box.left + ROOM_WIDTH, r);
      for (let c = box.left + 1; c < box.left + ROOM_WIDTH; c++) floor(c, r, pattern, box.label);
    }
    const prefix = `wo-${slug(box.label)}`;
    place(prefix, ROOM_FURNITURE, box.left, box.top);
    if (gridRow === 0) place(`${prefix}-wall`, ROOM_WALL_DECOR, box.left, box.top);
  });

  for (let c = 0; c < cols; c++) wall(c, lobbyTop);
  for (let r = lobbyTop + 1; r < rows; r++) {
    wall(0, r);
    wall(cols - 1, r);
    for (let c = 1; c < cols - 1; c++) floor(c, r, FLOOR_LOBBY, null);
  }

  boxes.forEach((box, i) => {
    const gridCol = i % gridCols;
    const hasRightNeighbour = gridCol < gridCols - 1 && i + 1 < count;
    if (hasRightNeighbour) {
      for (const dr of ROOM_SIDE_DOOR_ROWS) {
        floor(box.left + ROOM_WIDTH, box.top + dr, FLOOR_LOBBY, null);
      }
    }
    const below = i + gridCols;
    const bottomRow = box.top + ROOM_HEIGHT;
    if (below < count || bottomRow === lobbyTop) {
      floor(box.left + ROOM_BOTTOM_DOOR_COL, bottomRow, FLOOR_LOBBY, null);
    }
  });

  for (let k = 0; k < gridCols; k++) {
    place(
      `wo-lobby-lounge-${k + 1}`,
      LOBBY_LOUNGE,
      k * ROOM_WIDTH + LOBBY_LOUNGE_OFFSET_COL,
      lobbyTop + LOBBY_LOUNGE_OFFSET_ROW,
    );
  }
  place(
    'wo-lobby-plant',
    [
      ['PLANT', 1, 1],
      ['PLANT', cols - 2, LOBBY_INNER_ROWS - 3],
    ],
    0,
    lobbyTop,
  );

  return {
    layout: {
      version: 1,
      cols,
      rows,
      layoutRevision: LAYOUT_REVISION,
      tiles,
      tileColors,
      furniture,
      areas: labels.map((label) => ({ label, color: areaColor(label) })),
      areaTiles,
    },
    boxes,
    lobbyTop,
  };
}
