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
  { symbols: 2, colors: 2, lockRate: 0, wildRate: 0, bridgeRate: 0 },
  { symbols: 2, colors: 3, lockRate: 0.02, wildRate: 0.01, bridgeRate: 0.015 },
  { symbols: 3, colors: 3, lockRate: 0.04, wildRate: 0.015, bridgeRate: 0.02 },
  { symbols: 3, colors: 4, lockRate: 0.06, wildRate: 0.02, bridgeRate: 0.025 },
  { symbols: 4, colors: 4, lockRate: 0.08, wildRate: 0.025, bridgeRate: 0.03 },
] as const;

export const CLEARS_PER_STAGE = 4;

/** Starting undo charges (legacy / path systems). */
export const STARTING_UNDOS = 3;
/** Softlock recovery undos offered from the Game Over screen (Endless). */
export const STARTING_RECOVERY_UNDOS = 3;
/** Earn an undo charge when clearing a loop of this size or larger. */
export const UNDO_EARN_LOOP_SIZE = 6;
export const MAX_UNDOS = 5;

/** Combo level that triggers fever visuals and a score boost. */
export const FEVER_COMBO_THRESHOLD = 5;
/** Extra score multiplier while in fever (applied on top of combo). */
export const FEVER_SCORE_MULT = 1.25;

/** Free hints available at the start of each game. */
export const STARTING_HINTS = 5;
/** Cap on stored hints (including earned free ones). */
export const MAX_HINTS = 5;
/** Earn 1 free hint every N successful loop clears. */
export const FREE_HINT_EVERY_CLEARS = 5;
/** After this many connections with no clear, gently offer help once. */
export const FAILED_TRIES_BEFORE_HELP = 8;
/**
 * When out of hints, a math-earned full guide awards this fraction of the
 * normal clear score (still at least HINT_ZERO_MIN_SCORE).
 */
export const HINT_ZERO_SCORE_MULT = 0.1;
export const HINT_ZERO_MIN_SCORE = 5;

export const DAILY_MOVE_LIMIT = 13;
export const BOARD_GEN_MAX_ATTEMPTS = 80;

export const COLOR_HEX: Record<ColorId, string> = {
  coral: "#E85D4C",
  teal: "#2A9D8F",
  indigo: "#4A6FA5",
  amber: "#E9A319",
};
