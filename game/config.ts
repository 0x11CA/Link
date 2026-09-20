import type { ColorId, SymbolId } from "@/types/game";

export const GRID_SIZE = 5;
export const MAX_CONNECTIONS = 2;
export const MIN_LOOP_SIZE = 4;

export const ALL_SYMBOLS: SymbolId[] = [
  "circle",
  "triangle",
  "square",
  "diamond",
];

export const ALL_COLORS: ColorId[] = ["coral", "teal", "indigo", "amber"];

/** Orthogonal only in v1; diagonal reserved for future specials. */
export const ADJACENCY_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export const SCORING = {
  baseBySize: {
    4: 60,
    6: 120,
    8: 200,
  } as Record<number, number>,
  largeBase: 300,
  largeExtraPerTile: 40,
  largeThreshold: 10,
} as const;

/** Clears required before advancing difficulty stage. */
export const DIFFICULTY_STAGES = [
  { symbols: 2, colors: 2, lockRate: 0, wildRate: 0 },
  { symbols: 2, colors: 3, lockRate: 0.02, wildRate: 0.01 },
  { symbols: 3, colors: 3, lockRate: 0.04, wildRate: 0.015 },
  { symbols: 3, colors: 4, lockRate: 0.06, wildRate: 0.02 },
  { symbols: 4, colors: 4, lockRate: 0.08, wildRate: 0.025 },
] as const;

export const CLEARS_PER_STAGE = 4;

export const STARTING_UNDOS = 99;
/** @deprecated Undo is unlimited; kept for save compatibility. */
export const UNDO_EARN_LOOP_SIZE = 6;
export const MAX_UNDOS = 99;

/** Free hints available at the start of each game. */
export const STARTING_HINTS = 5;

/** Points deducted for the 1st…5th hint used in a game. */
export const HINT_PENALTIES = [25, 50, 80, 120, 180] as const;

export const DAILY_MOVE_LIMIT = 13;
export const BOARD_GEN_MAX_ATTEMPTS = 80;

export const COLOR_HEX: Record<ColorId, string> = {
  coral: "#E85D4C",
  teal: "#2A9D8F",
  indigo: "#4A6FA5",
  amber: "#E9A319",
};
