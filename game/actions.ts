import {
  applyGravityAndRefill,
  cloneBoard,
  createTile,
  emptyBoard,
  findTile,
  generatePlayableBoard,
  removeTiles,
  resetTileSeq,
  unlockAdjacentToCleared,
} from "@/game/board";
import { validateConnection } from "@/game/connections";
import {
  DAILY_MOVE_LIMIT,
  GRID_SIZE,
  STARTING_UNDOS,
} from "@/game/config";
import { generateDailyBoard, dailyMoveLimitFor } from "@/game/dailyBoard";
import { nextDifficultyStage } from "@/game/difficulty";
import { isGameOver } from "@/game/gameOver";
import { findCycleClosedByEdge } from "@/game/loops";
import { createRng } from "@/game/rng";
import { scoreLoop } from "@/game/scoring";
import type {
  GameAction,
  GameMode,
  GameState,
  HistorySnapshot,
  SessionStats,
  Tile,
  TileId,
} from "@/types/game";

function emptyStats(): SessionStats {
  return {
    loopsCreated: 0,
    largestLoop: 0,
    longestCombo: 0,
    totalConnections: 0,
  };
}

function snapshot(state: GameState): HistorySnapshot {
  return {
    board: cloneBoard(state.board),
    score: state.score,
    combo: state.combo,
    undosLeft: state.undosLeft,
    difficultyStage: state.difficultyStage,
    clearsCount: state.clearsCount,
    stats: { ...state.stats },
    moveCount: state.moveCount,
    dailySolved: state.dailySolved,
    gameOver: state.gameOver,
    lastClearSize: state.lastClearSize,
    lastScoreGain: state.lastScoreGain,
    closedLoop: false,
  };
}

function restore(state: GameState, snap: HistorySnapshot): GameState {
  return {
    ...state,
    board: cloneBoard(snap.board),
    score: snap.score,
    combo: snap.combo,
    undosLeft: snap.undosLeft,
    difficultyStage: snap.difficultyStage,
    clearsCount: snap.clearsCount,
    stats: { ...snap.stats },
    moveCount: snap.moveCount,
    dailySolved: snap.dailySolved,
    gameOver: snap.gameOver,
    lastClearSize: snap.lastClearSize,
    lastScoreGain: snap.lastScoreGain,
    lastClearedIds: [],
    selectedId: null,
    message: null,
  };
}

function withGameOverCheck(state: GameState): GameState {
  if (state.mode === "daily") {
    if (isBoardEmpty(state.board)) {
      return {
        ...state,
        dailySolved: true,
        gameOver: false,
        message: "Solved!",
      };
    }
    if (state.moveCount >= state.dailyMoveLimit && !isBoardEmpty(state.board)) {
      return {
        ...state,
        dailyFailed: true,
        gameOver: true,
        message: "Out of moves",
      };
    }
  }
  if (isGameOver(state)) {
    return { ...state, gameOver: true, message: "GAME OVER" };
  }
  return state;
}

export function isBoardEmpty(board: (Tile | null)[][]): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (cell) return false;
    }
  }
  return true;
}

function applyGravityDaily(board: (Tile | null)[][]): (Tile | null)[][] {
  const next = emptyBoard();
  for (let c = 0; c < GRID_SIZE; c++) {
    const stack: Tile[] = [];
    for (let r = GRID_SIZE - 1; r >= 0; r--) {
      const cell = board[r]![c];
      if (cell) stack.push(cell);
    }
    let writeRow = GRID_SIZE - 1;
    for (const tile of stack) {
      const moved = { ...tile, connections: [...tile.connections] };
      moved.row = writeRow;
      moved.col = c;
      next[writeRow]![c] = moved;
      writeRow -= 1;
    }
  }
  return next;
}

export interface CreateStateOptions {
  mode?: GameMode;
  seed?: number;
  board?: (Tile | null)[][];
  rngState?: number;
  dailyMoveLimit?: number;
  difficultyStage?: number;
}

export function createInitialState(opts: CreateStateOptions = {}): GameState {
  const mode = opts.mode ?? "endless";
  const seed = opts.seed ?? (Date.now() >>> 0);
  const stage = opts.difficultyStage ?? 0;

  let board = opts.board;
  let rngState = opts.rngState;
  if (!board) {
    const gen = generatePlayableBoard(seed, stage, {
      allowSpecials: mode === "endless",
    });
    board = gen.board;
    rngState = gen.rngState;
  }
  if (rngState === undefined) rngState = seed;

  return {
    mode,
    board,
    selectedId: null,
    score: 0,
    combo: 1,
    undosLeft: STARTING_UNDOS,
    difficultyStage: stage,
    clearsCount: 0,
    history: [],
    gameOver: false,
    lastClearSize: null,
    lastScoreGain: null,
    lastClearedIds: [],
    moveCount: 0,
    dailyMoveLimit: opts.dailyMoveLimit ?? DAILY_MOVE_LIMIT,
    dailySolved: false,
    dailyFailed: false,
    stats: emptyStats(),
    seed,
    rngState,
    message: null,
  };
}

function addConnection(
  board: (Tile | null)[][],
  a: TileId,
  b: TileId,
): (Tile | null)[][] {
  const next = cloneBoard(board);
  const ta = findTile(next, a);
  const tb = findTile(next, b);
  if (!ta || !tb) return next;
  if (!ta.connections.includes(b)) ta.connections.push(b);
  if (!tb.connections.includes(a)) tb.connections.push(a);
  return next;
}

export function reduce(state: GameState, action: GameAction): GameState {
  if (
    state.gameOver &&
    action.type !== "UNDO" &&
    action.type !== "REVERT"
  ) {
    return state;
  }
  if (
    state.dailySolved &&
    action.type !== "UNDO" &&
    action.type !== "REVERT"
  ) {
    return state;
  }

  switch (action.type) {
    case "CLEAR_SELECTION":
      return { ...state, selectedId: null };
    case "DISMISS_MESSAGE":
      return { ...state, message: null };
    case "SELECT": {
      const tile = findTile(state.board, action.tileId);
      if (!tile || tile.locked) return state;
      if (state.selectedId === action.tileId) {
        return { ...state, selectedId: null };
      }
      if (state.selectedId) {
        return reduce(state, {
          type: "CONNECT",
          fromId: state.selectedId,
          toId: action.tileId,
        });
      }
      return { ...state, selectedId: action.tileId, message: null };
    }
    case "UNDO": {
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1]!;
      const restored = restore(state, prev);
      return {
        ...restored,
        // Daily: undoing does not refund spent moves
        moveCount:
          state.mode === "daily" ? state.moveCount : restored.moveCount,
        undosLeft: state.undosLeft,
        history: state.history.slice(0, -1),
        combo: 1,
        message: null,
      };
    }
    case "REVERT": {
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1]!;
      const restored = restore(state, prev);
      return {
        ...restored,
        moveCount:
          state.mode === "daily" ? state.moveCount : restored.moveCount,
        undosLeft: state.undosLeft,
        history: state.history.slice(0, -1),
        message: null,
      };
    }
    case "CONNECT": {
      const validation = validateConnection(
        state,
        action.fromId,
        action.toId,
      );
      if (!validation.ok) {
        return {
          ...state,
          selectedId: null,
          message: null,
        };
      }

      const hist = [...state.history, snapshot(state)];
      let board = addConnection(state.board, action.fromId, action.toId);
      const cycle = findCycleClosedByEdge(board, action.fromId, action.toId);

      let next: GameState = {
        ...state,
        board,
        selectedId: null,
        history: hist,
        moveCount: state.moveCount + 1,
        stats: {
          ...state.stats,
          totalConnections: state.stats.totalConnections + 1,
        },
        lastClearSize: null,
        lastScoreGain: null,
        lastClearedIds: [],
        message: null,
      };

      if (!cycle) {
        // Non-closing connection resets combo
        next = { ...next, combo: 1 };
        return withGameOverCheck(next);
      }

      // Loop clear
      const size = cycle.length;
      const gain = scoreLoop(size, state.combo);
      const cleared = new Set(cycle);
      const unlockedBoard = unlockAdjacentToCleared(board, cleared);
      let afterRemove = removeTiles(unlockedBoard, cleared);

      const rng = createRng(state.rngState);
      if (state.mode === "daily") {
        afterRemove = applyGravityDaily(afterRemove);
      } else {
        afterRemove = applyGravityAndRefill(
          afterRemove,
          rng,
          nextDifficultyStage(state.clearsCount + 1),
          true,
        );
      }
      const newRng = Math.floor(rng() * 1e9) ^ state.rngState;

      let undosLeft = state.undosLeft;
      // Undo is unlimited — large loops no longer award undo charges.

      const newCombo = state.combo + 1;
      next = {
        ...next,
        board: afterRemove,
        score: state.score + gain,
        combo: newCombo,
        undosLeft,
        clearsCount: state.clearsCount + 1,
        difficultyStage: nextDifficultyStage(state.clearsCount + 1),
        rngState: newRng >>> 0,
        lastClearSize: size,
        lastScoreGain: gain,
        lastClearedIds: [...cycle],
        stats: {
          loopsCreated: state.stats.loopsCreated + 1,
          largestLoop: Math.max(state.stats.largestLoop, size),
          longestCombo: Math.max(state.stats.longestCombo, state.combo),
          totalConnections: next.stats.totalConnections,
        },
      };

      return withGameOverCheck(next);
    }
    default:
      return state;
  }
}

export function newEndlessGame(seed?: number): GameState {
  resetTileSeq(0);
  return createInitialState({
    mode: "endless",
    seed: seed ?? (Date.now() ^ (Math.random() * 1e9)) >>> 0,
  });
}

export function newDailyGame(dateStr: string): GameState {
  const { board, seed, rngState, tileCount } = generateDailyBoard(dateStr);
  return createInitialState({
    mode: "daily",
    seed,
    board,
    rngState,
    dailyMoveLimit: dailyMoveLimitFor(tileCount),
  });
}

/** Exported for tests — force-create a tile (bypasses specials). */
export { createTile };
