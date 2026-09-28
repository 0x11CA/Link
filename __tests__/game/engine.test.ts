import { describe, expect, it } from "vitest";
import {
  allTiles,
  areOrthogonalNeighbors,
  canMatch,
  cloneBoard,
  generatePlayableBoard,
} from "@/game/board";
import { validateConnection, listLegalConnections } from "@/game/connections";
import { MAX_CONNECTIONS, MIN_LOOP_SIZE } from "@/game/config";
import { findCycleClosedByEdge } from "@/game/loops";
import { baseScoreForLoop, scoreLoop } from "@/game/scoring";
import { nextDifficultyStage } from "@/game/difficulty";
import { LEVEL_PRESETS } from "@/game/config";
import {
  createInitialState,
  newDailyGame,
  newEndlessGame,
  reduce,
} from "@/game/actions";
import {
  assertDailyDeterminism,
  dailySeed,
  generateDailyBoard,
} from "@/game/dailyBoard";
import { isGameOver, hasLegalMoves } from "@/game/gameOver";
import type { GameState, Tile } from "@/types/game";

function tile(
  partial: Partial<Tile> & Pick<Tile, "id" | "row" | "col" | "symbol" | "color">,
): Tile {
  return {
    locked: false,
    wild: false,
    bridge: false,
    connections: [],
    ...partial,
  };
}

function stateFromBoard(board: (Tile | null)[][]): GameState {
  return createInitialState({ mode: "endless", seed: 1, board, rngState: 1 });
}

describe("connection validation", () => {
  it("allows same symbol neighbors", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
    });
    const b = tile({
      id: "b",
      row: 0,
      col: 1,
      symbol: "circle",
      color: "teal",
    });
    const board = [
      [a, b, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
    ];
    const state = stateFromBoard(board);
    expect(validateConnection(state, "a", "b").ok).toBe(true);
  });

  it("allows same color neighbors", () => {
    const a = tile({
      id: "a",
      row: 1,
      col: 1,
      symbol: "square",
      color: "teal",
    });
    const b = tile({
      id: "b",
      row: 2,
      col: 1,
      symbol: "diamond",
      color: "teal",
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[1]![1] = a;
    board[2]![1] = b;
    const state = stateFromBoard(board);
    expect(validateConnection(state, "a", "b").ok).toBe(true);
  });

  it("rejects diagonal", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
    });
    const b = tile({
      id: "b",
      row: 1,
      col: 1,
      symbol: "circle",
      color: "coral",
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[0]![0] = a;
    board[1]![1] = b;
    const state = stateFromBoard(board);
    expect(validateConnection(state, "a", "b").reason).toBe("not_adjacent");
  });

  it("rejects when connection limit reached", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
      connections: ["x", "y"],
    });
    const b = tile({
      id: "b",
      row: 0,
      col: 1,
      symbol: "circle",
      color: "teal",
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[0]![0] = a;
    board[0]![1] = b;
    const state = stateFromBoard(board);
    expect(validateConnection(state, "a", "b").reason).toBe("full");
  });

  it("wild matches anything", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
      wild: true,
    });
    const b = tile({
      id: "b",
      row: 0,
      col: 1,
      symbol: "square",
      color: "indigo",
    });
    expect(canMatch(a, b)).toBe(true);
  });
});

describe("loop detection", () => {
  it("detects a 4-cycle when the closing edge is added", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
      connections: ["b", "d"],
    });
    const b = tile({
      id: "b",
      row: 0,
      col: 1,
      symbol: "circle",
      color: "teal",
      connections: ["a", "c"],
    });
    const c = tile({
      id: "c",
      row: 1,
      col: 1,
      symbol: "square",
      color: "teal",
      connections: ["b"],
    });
    const d = tile({
      id: "d",
      row: 1,
      col: 0,
      symbol: "square",
      color: "coral",
      connections: ["a"],
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[0]![0] = a;
    board[0]![1] = b;
    board[1]![1] = c;
    board[1]![0] = d;

    // Add closing edge c-d
    c.connections.push("d");
    d.connections.push("c");
    const cycle = findCycleClosedByEdge(board, "c", "d");
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(MIN_LOOP_SIZE);
  });
});

describe("scoring", () => {
  it("scores loop sizes with combo", () => {
    expect(baseScoreForLoop(4)).toBe(60);
    expect(baseScoreForLoop(6)).toBe(120);
    expect(scoreLoop(4, 2)).toBe(120);
    expect(scoreLoop(4, 1)).toBe(60);
  });
});

describe("board generation", () => {
  it("generates playable boards", () => {
    const { board } = generatePlayableBoard(42, 0);
    expect(board.length).toBe(5);
    expect(board[0]!.length).toBe(5);
    const state = stateFromBoard(board);
    expect(listLegalConnections(state).length).toBeGreaterThan(0);
  });
});

describe("game over", () => {
  it("detects no moves", () => {
    // Checkerboard of mismatched unique pairs that can't connect — force empty legal list
    const board = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) =>
        tile({
          id: `t${r}-${c}`,
          row: r,
          col: c,
          symbol: "circle",
          color: "coral",
          locked: true,
        }),
      ),
    );
    const state = stateFromBoard(board);
    expect(hasLegalMoves(state)).toBe(false);
    expect(isGameOver(state)).toBe(true);
  });
});

describe("daily seeds", () => {
  it("is deterministic for a date", () => {
    expect(assertDailyDeterminism("2026-09-20")).toBe(true);
    expect(dailySeed("2026-09-20")).toBe(dailySeed("2026-09-20"));
    const a = generateDailyBoard("2026-09-20");
    const b = generateDailyBoard("2026-09-20");
    expect(a.seed).toBe(b.seed);
  });
});

describe("reduce connect + clear", () => {
  it("clears a 4-loop and awards points", () => {
    // Build a 2x2 of matching tiles ready to loop
    const a = tile({
      id: "a",
      row: 3,
      col: 0,
      symbol: "circle",
      color: "coral",
    });
    const b = tile({
      id: "b",
      row: 3,
      col: 1,
      symbol: "circle",
      color: "teal",
    });
    const c = tile({
      id: "c",
      row: 4,
      col: 1,
      symbol: "square",
      color: "teal",
    });
    const d = tile({
      id: "d",
      row: 4,
      col: 0,
      symbol: "square",
      color: "coral",
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[3]![0] = a;
    board[3]![1] = b;
    board[4]![1] = c;
    board[4]![0] = d;
    // Fill rest so gravity has tiles
    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < 5; col++) {
        if (!board[r]![col]) {
          board[r]![col] = tile({
            id: `f${r}${col}`,
            row: r,
            col,
            symbol: "diamond",
            color: "indigo",
          });
        }
      }
    }

    let state = stateFromBoard(cloneBoard(board));
    state = reduce(state, { type: "CONNECT", fromId: "a", toId: "b" });
    state = reduce(state, { type: "CONNECT", fromId: "b", toId: "c" });
    state = reduce(state, { type: "CONNECT", fromId: "c", toId: "d" });
    state = reduce(state, { type: "CONNECT", fromId: "d", toId: "a" });

    expect(state.stats.loopsCreated).toBe(1);
    expect(state.score).toBe(60);
    expect(state.lastClearSize).toBe(4);
    // Loop is final — no undo trail past a clear
    expect(state.history.length).toBe(0);
    const afterUndo = reduce(state, { type: "UNDO" });
    expect(afterUndo.score).toBe(60);
    expect(afterUndo.stats.loopsCreated).toBe(1);
  });

  it("never exceeds max connections", () => {
    const state = newEndlessGame("medium", 99);
    for (const row of state.board) {
      for (const t of row) {
        if (t) expect(t.connections.length).toBeLessThanOrEqual(MAX_CONNECTIONS);
      }
    }
  });

  it("ortho neighbor helper", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
    });
    const b = tile({
      id: "b",
      row: 0,
      col: 1,
      symbol: "circle",
      color: "coral",
    });
    expect(areOrthogonalNeighbors(a, b)).toBe(true);
  });
});

describe("daily sparse puzzle", () => {
  it("has a denser harder board and limited moves", () => {
    const { board, tileCount } = generateDailyBoard("2026-09-20");
    expect(allTiles(board).length).toBe(tileCount);
    expect(tileCount).toBeGreaterThanOrEqual(12);

    const state = newDailyGame("2026-09-20");
    expect(state.dailyMoveLimit).toBeLessThanOrEqual(14);
    expect(state.dailyMoveLimit).toBeGreaterThanOrEqual(12);
    expect(listLegalConnections(state).length).toBeGreaterThan(0);
  });
});

describe("always a route", () => {
  it("new boards always have a clearable 2x2", async () => {
    const { hasClearableTwoByTwo } = await import("@/game/routes");
    for (let i = 0; i < 50; i++) {
      const state = newEndlessGame("medium", (i * 99991) >>> 0);
      expect(hasClearableTwoByTwo(state.board)).toBe(true);
    }
  });

  it("repair restores a route when stuck", async () => {
    const { ensureCompletableRoute, hasClearableTwoByTwo } = await import(
      "@/game/routes"
    );
    const { createRng } = await import("@/game/rng");
    // All locked board → plant unlocks a 2x2
    const board = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) =>
        tile({
          id: `L${r}-${c}`,
          row: r,
          col: c,
          symbol: "circle",
          color: "coral",
          locked: true,
        }),
      ),
    );
    expect(hasClearableTwoByTwo(board)).toBe(false);
    const fixed = ensureCompletableRoute(board, createRng(1), 0);
    expect(hasClearableTwoByTwo(fixed)).toBe(true);
  });
});

describe("full loop hints", () => {
  it("returns an entire cycle of at least 4 tiles maximizing score", async () => {
    const { suggestHint } = await import("@/game/hints");
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
    });
    const b = tile({
      id: "b",
      row: 0,
      col: 1,
      symbol: "circle",
      color: "teal",
    });
    const c = tile({
      id: "c",
      row: 1,
      col: 1,
      symbol: "square",
      color: "teal",
    });
    const d = tile({
      id: "d",
      row: 1,
      col: 0,
      symbol: "square",
      color: "coral",
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[0]![0] = a;
    board[0]![1] = b;
    board[1]![1] = c;
    board[1]![0] = d;
    const state = stateFromBoard(board);
    const hint = suggestHint(state);
    expect(hint).not.toBeNull();
    expect(hint!.tileIds.length).toBeGreaterThanOrEqual(4);
    expect(hint!.edges.length).toBe(hint!.tileIds.length);
    expect(hint!.potentialScore).toBeGreaterThan(0);
  });
});

describe("bridge diagonals", () => {
  it("allows diagonal connection when either tile is a bridge", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
      bridge: true,
    });
    const b = tile({
      id: "b",
      row: 1,
      col: 1,
      symbol: "circle",
      color: "teal",
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[0]![0] = a;
    board[1]![1] = b;
    const state = stateFromBoard(board);
    const v = validateConnection(state, "a", "b");
    expect(v.ok).toBe(true);
  });

  it("rejects diagonal without a bridge", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
    });
    const b = tile({
      id: "b",
      row: 1,
      col: 1,
      symbol: "circle",
      color: "teal",
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[0]![0] = a;
    board[1]![1] = b;
    const state = stateFromBoard(board);
    expect(validateConnection(state, "a", "b").ok).toBe(false);
  });
});

describe("fever scoring and undos", () => {
  it("applies fever multiplier at high combo", () => {
    const base = scoreLoop(4, 1);
    const fever = scoreLoop(4, 5);
    expect(fever).toBeGreaterThan(base * 5);
  });

  it("spends an undo charge on UNDO but not REVERT", () => {
    const a = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
    });
    const b = tile({
      id: "b",
      row: 0,
      col: 1,
      symbol: "circle",
      color: "teal",
    });
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    ) as (Tile | null)[][];
    board[0]![0] = a;
    board[0]![1] = b;
    let state = stateFromBoard(board);
    state = { ...state, undosLeft: 2 };
    state = reduce(state, { type: "CONNECT", fromId: "a", toId: "b" });
    expect(state.history.length).toBe(1);
    const afterRevert = reduce(state, { type: "REVERT" });
    expect(afterRevert.undosLeft).toBe(2);
    // reconnect then UNDO
    state = reduce(afterRevert, { type: "CONNECT", fromId: "a", toId: "b" });
    const afterUndo = reduce(state, { type: "UNDO" });
    expect(afterUndo.undosLeft).toBe(1);
  });

  it("daily game includes seeded objectives", () => {
    const daily = newDailyGame("2026-09-25");
    expect(daily.dailyObjectives).not.toBeNull();
    expect(daily.dailyProgress).not.toBeNull();
    expect(daily.dailyObjectives!.minLoopSize).toBeGreaterThanOrEqual(4);
  });
});

describe("difficulty levels", () => {
  it("easy starts at stage 0 and never exceeds max stage 1", () => {
    const state = newEndlessGame("easy", 42);
    expect(state.difficultyLevel).toBe("easy");
    expect(state.difficultyStage).toBe(LEVEL_PRESETS.easy.startStage);
    expect(nextDifficultyStage(0, "easy")).toBe(0);
    expect(nextDifficultyStage(4, "easy")).toBe(1);
    expect(nextDifficultyStage(40, "easy")).toBe(LEVEL_PRESETS.easy.maxStage);
  });

  it("hard starts at stage 3 and caps at 4", () => {
    const state = newEndlessGame("hard", 7);
    expect(state.difficultyStage).toBe(LEVEL_PRESETS.hard.startStage);
    expect(nextDifficultyStage(0, "hard")).toBe(3);
    expect(nextDifficultyStage(4, "hard")).toBe(4);
    expect(nextDifficultyStage(99, "hard")).toBe(LEVEL_PRESETS.hard.maxStage);
  });

  it("medium sits between easy and hard start stages", () => {
    const easy = newEndlessGame("easy", 1);
    const medium = newEndlessGame("medium", 1);
    const hard = newEndlessGame("hard", 1);
    expect(easy.difficultyStage).toBeLessThan(medium.difficultyStage);
    expect(medium.difficultyStage).toBeLessThanOrEqual(hard.difficultyStage);
  });
});
