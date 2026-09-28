export type SymbolId = "circle" | "triangle" | "square" | "diamond";
export type ColorId = "coral" | "teal" | "indigo" | "amber";
export type TileId = string;
export type GameMode = "endless" | "daily";

export interface Tile {
  id: TileId;
  row: number;
  col: number;
  symbol: SymbolId;
  color: ColorId;
  locked: boolean;
  wild: boolean;
  /** Allows diagonal links when either endpoint is a bridge. */
  bridge: boolean;
  connections: TileId[];
}

/** Seeded bonus goals for the daily puzzle. */
export interface DailyObjectives {
  /** Clear at least one loop of this size (or larger). */
  minLoopSize: number;
  /** Include at most this many wild tiles across all clears. */
  maxWildUses: number;
  /** Reach this score before (or when) solving. */
  targetScore: number;
}

export interface DailyProgress {
  bestLoopSize: number;
  wildsUsed: number;
  loopGoalMet: boolean;
  wildGoalMet: boolean;
  scoreGoalMet: boolean;
}

export interface ConnectionEdge {
  a: TileId;
  b: TileId;
}

export interface SessionStats {
  loopsCreated: number;
  largestLoop: number;
  longestCombo: number;
  totalConnections: number;
}

export interface HistorySnapshot {
  board: (Tile | null)[][];
  score: number;
  combo: number;
  undosLeft: number;
  difficultyStage: number;
  clearsCount: number;
  stats: SessionStats;
  moveCount: number;
  dailySolved: boolean;
  gameOver: boolean;
  lastClearSize: number | null;
  lastScoreGain: number | null;
  closedLoop: boolean;
}

export interface GameState {
  mode: GameMode;
  board: (Tile | null)[][];
  selectedId: TileId | null;
  score: number;
  combo: number;
  undosLeft: number;
  difficultyStage: number;
  clearsCount: number;
  history: HistorySnapshot[];
  gameOver: boolean;
  lastClearSize: number | null;
  lastScoreGain: number | null;
  lastClearedIds: TileId[];
  /** Positions of last cleared tiles (for FX after board removal). */
  lastClearPositions: Array<{
    id: TileId;
    row: number;
    col: number;
    color: ColorId;
  }>;
  moveCount: number;
  dailyMoveLimit: number;
  dailySolved: boolean;
  dailyFailed: boolean;
  stats: SessionStats;
  seed: number;
  rngState: number;
  message: string | null;
  /** Present in daily mode. */
  dailyObjectives: DailyObjectives | null;
  dailyProgress: DailyProgress | null;
  /** Endless: undos left to recover from softlock Game Over (max 3 per run). */
  recoveryUndosLeft: number;
  /** Board/score before the clear that may have softlocked; used by RECOVER_UNDO. */
  preClearSnapshot: HistorySnapshot | null;
}

export type GameAction =
  | { type: "SELECT"; tileId: TileId }
  | { type: "CONNECT"; fromId: TileId; toId: TileId }
  | { type: "UNDO" }
  /** Undo last connection without spending an undo charge (path backtrack / cancel). */
  | { type: "REVERT" }
  /** Endless: rewind softlock using a recovery undo charge. */
  | { type: "RECOVER_UNDO" }
  /** Endless: decline recovery and finalize game over. */
  | { type: "ACCEPT_GAME_OVER" }
  | { type: "CLEAR_SELECTION" }
  | { type: "DISMISS_MESSAGE" };

export interface PersistedStats {
  gamesPlayed: number;
  bestScore: number;
  totalScore: number;
  totalLoops: number;
  largestLoop: number;
  bestCombo: number;
  totalConnections: number;
}

export interface Settings {
  sound: boolean;
  haptics: boolean;
}

export interface DailyResult {
  date: string;
  solved: boolean;
  moves: number;
  limit: number;
  score?: number;
  objectivesMet?: number;
  objectivesTotal?: number;
}

export interface DailyStreak {
  current: number;
  best: number;
  lastSolvedDate: string | null;
  /** YYYY-MM-DD keys solved (kept trimmed). */
  solvedDates: string[];
}

export interface TeachFlags {
  seenWild: boolean;
  seenLock: boolean;
  seenBridge: boolean;
}
