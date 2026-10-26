export const ROOMS_CONFIG_FILE_NAME = 'projects.json';
export const ROOMS_STATE_FILE_NAME = 'rooms-state.json';
export const ROOMS_POLL_INTERVAL_MS = 5_000;
export const ROOMS_GIT_TIMEOUT_MS = 15_000;
export const ROOMS_PR_POLL_MS = 60_000;
export const ROOMS_PORT_POLL_MS = 5_000;
export const ROOMS_STATE_BROADCAST_MS = 10_000;
export const PORT_CHECK_TIMEOUT_MS = 400;
export const TASK_TITLE_MAX = 60;
export const TASK_SPLIT_TIMEOUT_MS = 120_000;
export const TASK_PROMPT_READY_FALLBACK_MS = 15_000;
export const TASK_PROMPT_QUIET_MS = 1_500;
export const TASK_READY_MIN_VISIBLE = 150;
export const UPLOADS_DIR_NAME = 'uploads';
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_KEEP_MS = 7 * 24 * 3_600_000;
export const UPLOAD_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
export const REPLY_BUSY_MS = 15_000;
export const REPLY_START_TIMEOUT_MS = 90_000;
export const TASK_SUBMIT_DELAY_MS = 400;
export const TASK_PREPARE_TIMEOUT_MS = 20 * 60_000;
export const TASKS_BROADCAST_MS = 10_000;
export const SESSION_SWEEP_INTERVAL_MS = 30_000;
export const SESSION_IDLE_DEFAULT_MINUTES = 120;
export const ACTIVITY_TAIL_STEPS: readonly number[] = [256 * 1024, 4 * 1024 * 1024];
export const TRANSCRIPT_HEAD_BYTES = 256 * 1024;
export const SESSION_INFO_POLL_MS = 5_000;
export const SESSION_INFO_BROADCAST_MS = 10_000;
export const SESSION_INFO_TAIL_BYTES = 4 * 1024 * 1024;
export const SESSION_LAST_TEXT_MAX = 600;
export const SESSION_LAST_TEXT_HEAD = 160;
export const SESSION_PR_LINKS_MAX = 20;
export const RELEASE_COMMAND_TIMEOUT_MS = 60_000;
export const RELEASE_REMOVE_TIMEOUT_MS = 10 * 60_000;
export const RELEASE_LOG_FILE_NAME = 'release.log';
export const RELEASE_MAX_LISTED_FILES = 20;
export const ROOMS_MAX = 24;
export const ROOMS_MAX_COLUMNS = 6;

export const ROOM_WIDTH = 10;
export const ROOM_HEIGHT = 11;
export const LOBBY_INNER_ROWS = 8;
export const LOBBY_ONLY_COLUMNS = 3;
export const LAYOUT_TOP_PADDING = 1;
export const LAYOUT_REVISION = 1;

export const TILE_VOID = 255;
export const TILE_WALL = 0;
export const FLOOR_ROOM_A = 7;
export const FLOOR_ROOM_B = 1;
export const FLOOR_LOBBY = 9;

export interface TileColor {
  h: number;
  s: number;
  b: number;
  c: number;
}

export const WALL_COLOR: TileColor = { h: 214, s: 30, b: -100, c: -55 };
export const FLOOR_COLORS: Record<number, TileColor> = {
  [FLOOR_ROOM_B]: { h: 209, s: 39, b: -25, c: -80 },
  [FLOOR_ROOM_A]: { h: 25, s: 48, b: -43, c: -88 },
  [FLOOR_LOBBY]: { h: 209, s: 0, b: -16, c: -8 },
};

export const AREA_HUE_START = 205;
export const AREA_HUE_STEP = 137.508;
export const AREA_SATURATION = 0.7;
export const AREA_LIGHTNESS = 0.62;

export type FurniturePlacement = readonly [type: string, col: number, row: number];

export const ROOM_FURNITURE: readonly FurniturePlacement[] = [
  ['DESK_FRONT', 2, 2],
  ['DESK_FRONT', 6, 2],
  ['PC_FRONT_OFF', 3, 2],
  ['PC_FRONT_OFF', 7, 2],
  ['CUSHIONED_BENCH', 3, 4],
  ['CUSHIONED_BENCH', 7, 4],
  ['TABLE_FRONT', 4, 6],
  ['WOODEN_CHAIR_SIDE', 3, 6],
  ['WOODEN_CHAIR_SIDE', 3, 8],
  ['WOODEN_CHAIR_SIDE:left', 7, 6],
  ['WOODEN_CHAIR_SIDE:left', 7, 8],
  ['PC_SIDE', 4, 6],
  ['PC_SIDE', 4, 8],
  ['PC_SIDE:left', 6, 6],
  ['PC_SIDE:left', 6, 8],
  ['PLANT_2', 1, 7],
  ['SMALL_TABLE_SIDE', 1, 8],
  ['COFFEE', 1, 9],
  ['BIN', 2, 10],
];

export const ROOM_WALL_DECOR: readonly FurniturePlacement[] = [
  ['HANGING_PLANT', 1, -1],
  ['DOUBLE_BOOKSHELF', 2, -1],
  ['CLOCK', 5, -1],
  ['DOUBLE_BOOKSHELF', 7, -1],
  ['HANGING_PLANT', 9, -1],
];

export const LOBBY_LOUNGE: readonly FurniturePlacement[] = [
  ['SOFA_FRONT', 1, 0],
  ['SOFA_SIDE', 0, 1],
  ['COFFEE_TABLE', 1, 1],
  ['SOFA_SIDE:left', 3, 1],
  ['SOFA_BACK', 1, 3],
  ['COFFEE', 1, 2],
];

export const ROOM_SIDE_DOOR_ROWS: readonly number[] = [4, 5, 6];
export const ROOM_BOTTOM_DOOR_COL = 9;
export const LOBBY_LOUNGE_OFFSET_COL = 2;
export const LOBBY_LOUNGE_OFFSET_ROW = 3;

export const DEMO_PROJECT = 'acme-shop';
export const DEMO_GITHUB_REPO = 'acme/acme-shop';
export const DEMO_BEAT_MS = 2_500;
export const DEMO_WORKTREES: ReadonlyArray<{ name: string; branch: string | null }> = [
  { name: 'checkout-redesign', branch: 'feat/checkout-redesign' },
  { name: 'fix-cart-total', branch: 'fix/cart-total' },
  { name: 'api-docs', branch: 'docs/api' },
  { name: 'search-filters', branch: 'feat/search-filters' },
  { name: 'release-1-4', branch: null },
  { name: 'old-banner', branch: 'feat/old-banner' },
];

export const FIRST_RUN_SETTINGS = {
  alwaysShowLabels: true,
  watchAllSessions: true,
  showAreas: true,
  hooksInfoShown: true,
} as const;
