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
  connections: TileId[];
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
  moveCount: number;
  dailyMoveLimit: number;
  dailySolved: boolean;
  dailyFailed: boolean;
  stats: SessionStats;
  seed: number;
  rngState: number;
  message: string | null;
}

export type GameAction =
  | { type: "SELECT"; tileId: TileId }
  | { type: "CONNECT"; fromId: TileId; toId: TileId }
  | { type: "UNDO" }
  /** Undo last connection without spending an undo charge (path backtrack / cancel). */
  | { type: "REVERT" }
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
}
