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
  LEVEL_PRESETS,
  MAX_UNDOS,
  STARTING_UNDOS,
  UNDO_EARN_LOOP_SIZE,
} from "@/game/config";
import { generateDailyBoard, dailyMoveLimitFor } from "@/game/dailyBoard";
import {
  createDailyObjectives,
  emptyDailyProgress,
  updateDailyProgress,
} from "@/game/dailyObjectives";
import { nextDifficultyStage } from "@/game/difficulty";
import { isGameOver } from "@/game/gameOver";
import { findCycleClosedByEdge } from "@/game/loops";
import { createRng } from "@/game/rng";
import { ensureCompletableRoute } from "@/game/routes";
import { scoreLoop } from "@/game/scoring";
import type {
  ColorId,
  DifficultyLevel,
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
    // Never revive clear FX / score floaters from history
    lastClearSize: null,
    lastScoreGain: null,
    lastClearedIds: [],
    lastClearPositions: [],
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
    return state;
  }

  // Endless: if stuck, plant a guaranteed route instead of ending the game
  if (isGameOver(state)) {
    const rng = createRng(state.rngState ^ 0xdecaf);
    const repaired = ensureCompletableRoute(
      state.board,
      rng,
      state.difficultyStage,
    );
    return {
      ...state,
      board: repaired,
      gameOver: false,
      selectedId: null,
      message: null,
      rngState: (Math.floor(rng() * 1e9) ^ state.rngState) >>> 0,
    };
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
  difficultyLevel?: DifficultyLevel | null;
}

export function createInitialState(opts: CreateStateOptions = {}): GameState {
  const mode = opts.mode ?? "endless";
  const seed = opts.seed ?? (Date.now() >>> 0);
  const difficultyLevel =
    opts.difficultyLevel !== undefined
      ? opts.difficultyLevel
      : mode === "endless"
        ? ("medium" as DifficultyLevel)
        : null;
  const stage =
    opts.difficultyStage ??
    (difficultyLevel ? LEVEL_PRESETS[difficultyLevel].startStage : 0);

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
    lastClearPositions: [],
    moveCount: 0,
    dailyMoveLimit: opts.dailyMoveLimit ?? DAILY_MOVE_LIMIT,
    dailySolved: false,
    dailyFailed: false,
    stats: emptyStats(),
    seed,
    rngState,
    message: null,
    difficultyLevel,
    dailyObjectives: null,
    dailyProgress: null,
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
      if (state.undosLeft <= 0) return state;
      const prev = state.history[state.history.length - 1]!;
      const restored = restore(state, prev);
      return {
        ...restored,
        // Daily: undoing does not refund spent moves
        moveCount:
          state.mode === "daily" ? state.moveCount : restored.moveCount,
        undosLeft: state.undosLeft - 1,
        history: state.history.slice(0, -1),
        combo: 1,
        message: null,
        dailyObjectives: state.dailyObjectives,
        dailyProgress: state.dailyProgress,
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
        dailyObjectives: state.dailyObjectives,
        dailyProgress: state.dailyProgress,
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
      const clearPositions = cycle.map((id) => {
        const t = findTile(board, id)!;
        return {
          id,
          row: t.row,
          col: t.col,
          color: t.color as ColorId,
        };
      });
      const wildsInLoop = clearPositions.reduce((n, p) => {
        const t = findTile(board, p.id);
        return n + (t?.wild ? 1 : 0);
      }, 0);
      const unlockedBoard = unlockAdjacentToCleared(board, cleared);
      let afterRemove = removeTiles(unlockedBoard, cleared);

      const rng = createRng(state.rngState);
      const nextStage = nextDifficultyStage(
        state.clearsCount + 1,
        state.difficultyLevel,
      );
      if (state.mode === "daily") {
        afterRemove = applyGravityDaily(afterRemove);
      } else {
        afterRemove = applyGravityAndRefill(
          afterRemove,
          rng,
          nextStage,
          true,
        );
      }
      const newRng = Math.floor(rng() * 1e9) ^ state.rngState;

      let undosLeft = state.undosLeft;
      if (size >= UNDO_EARN_LOOP_SIZE) {
        undosLeft = Math.min(MAX_UNDOS, undosLeft + 1);
      }

      const newScore = state.score + gain;
      const newCombo = state.combo + 1;

      let dailyProgress = state.dailyProgress;
      if (state.dailyObjectives && state.dailyProgress) {
        dailyProgress = updateDailyProgress(
          state.dailyProgress,
          state.dailyObjectives,
          {
            loopSize: size,
            wildsInLoop,
            score: newScore,
          },
        );
      }

      next = {
        ...next,
        // Loop is committed — cannot undo / go back past a clear
        history: [],
        board: afterRemove,
        score: newScore,
        combo: newCombo,
        undosLeft,
        clearsCount: state.clearsCount + 1,
        difficultyStage: nextStage,
        rngState: newRng >>> 0,
        lastClearSize: size,
        lastScoreGain: gain,
        lastClearedIds: [...cycle],
        lastClearPositions: clearPositions,
        dailyProgress,
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

export function newEndlessGame(
  level: DifficultyLevel = "medium",
  seed?: number,
): GameState {
  resetTileSeq(0);
  return createInitialState({
    mode: "endless",
    difficultyLevel: level,
    seed: seed ?? (Date.now() ^ (Math.random() * 1e9)) >>> 0,
  });
}

export function newDailyGame(dateStr: string): GameState {
  const { board, seed, rngState, tileCount } = generateDailyBoard(dateStr);
  const objectives = createDailyObjectives(dateStr);
  const state = createInitialState({
    mode: "daily",
    difficultyLevel: null,
    seed,
    board,
    rngState,
    dailyMoveLimit: dailyMoveLimitFor(tileCount),
  });
  return {
    ...state,
    dailyObjectives: objectives,
    dailyProgress: emptyDailyProgress(objectives),
  };
}

/** Exported for tests — force-create a tile (bypasses specials). */
export { createTile };
