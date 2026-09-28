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
import { isEdgeOnLongestLoop, suggestHint } from "@/game/hints";
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

  it("endless softlock sets gameOver without repairing the board", () => {
    // Only one legal pair; everything else locked → connect ends the run
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
    board[0]![0] = tile({
      id: "a",
      row: 0,
      col: 0,
      symbol: "circle",
      color: "coral",
      locked: false,
    });
    board[0]![1] = tile({
      id: "b",
      row: 0,
      col: 1,
      symbol: "circle",
      color: "teal",
      locked: false,
    });
    let state = stateFromBoard(board);
    expect(state.recoveryUndosLeft).toBe(3);
    state = reduce(state, { type: "CONNECT", fromId: "a", toId: "b" });
    expect(state.gameOver).toBe(true);
    expect(state.message).toBe("No moves left");
    // Board was not auto-planted with a fresh 2x2
    expect(state.board[1]![1]!.locked).toBe(true);
    expect(state.board[1]![1]!.id).toBe("t1-1");
  });

  it("recover undo restores pre-clear board and spends a charge", () => {
    const playable = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) =>
        tile({
          id: `p${r}-${c}`,
          row: r,
          col: c,
          symbol: "circle",
          color: "coral",
          locked: false,
        }),
      ),
    );
    // Make a distinct before-clear board
    playable[0]![0] = tile({
      id: "keep-a",
      row: 0,
      col: 0,
      symbol: "diamond",
      color: "amber",
      locked: false,
      connections: ["keep-b"],
    });
    playable[0]![1] = tile({
      id: "keep-b",
      row: 0,
      col: 1,
      symbol: "diamond",
      color: "teal",
      locked: false,
      connections: ["keep-a"],
    });

    const stuck = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) =>
        tile({
          id: `s${r}-${c}`,
          row: r,
          col: c,
          symbol: "circle",
          color: "coral",
          locked: true,
        }),
      ),
    );

    const before: GameState = {
      ...stateFromBoard(playable),
      score: 40,
      clearsCount: 1,
    };
    const softlocked: GameState = {
      ...stateFromBoard(stuck),
      score: 100,
      gameOver: true,
      message: "No moves left",
      recoveryUndosLeft: 3,
      preClearSnapshot: {
        board: cloneBoard(before.board),
        score: before.score,
        combo: before.combo,
        undosLeft: before.undosLeft,
        difficultyStage: before.difficultyStage,
        clearsCount: before.clearsCount,
        stats: { ...before.stats },
        moveCount: before.moveCount,
        dailySolved: false,
        gameOver: false,
        lastClearSize: null,
        lastScoreGain: null,
        closedLoop: false,
      },
    };

    const recovered = reduce(softlocked, { type: "RECOVER_UNDO" });
    expect(recovered.gameOver).toBe(false);
    expect(recovered.recoveryUndosLeft).toBe(2);
    expect(recovered.preClearSnapshot).toBeNull();
    expect(recovered.score).toBe(40);
    expect(recovered.board[0]![0]!.id).toBe("keep-a");
    // Connections cleared so the player can try a different path
    expect(recovered.board[0]![0]!.connections).toEqual([]);
    expect(recovered.board[0]![1]!.connections).toEqual([]);
  });

  it("recover into a board with no legal moves softlocks again immediately", () => {
    const stuck = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) =>
        tile({
          id: `dead-${r}-${c}`,
          row: r,
          col: c,
          symbol: "circle",
          color: "coral",
          locked: true,
        }),
      ),
    );
    const softlocked: GameState = {
      ...stateFromBoard(stuck),
      gameOver: true,
      message: "No moves left",
      recoveryUndosLeft: 2,
      preClearSnapshot: {
        board: cloneBoard(stuck),
        score: 10,
        combo: 1,
        undosLeft: 3,
        difficultyStage: 0,
        clearsCount: 0,
        stats: {
          loopsCreated: 0,
          largestLoop: 0,
          longestCombo: 0,
          totalConnections: 0,
        },
        moveCount: 0,
        dailySolved: false,
        gameOver: false,
        lastClearSize: null,
        lastScoreGain: null,
        closedLoop: false,
      },
    };
    const recovered = reduce(softlocked, { type: "RECOVER_UNDO" });
    expect(recovered.recoveryUndosLeft).toBe(1);
    expect(recovered.gameOver).toBe(true);
    expect(recovered.message).toBe("No moves left");
    expect(recovered.preClearSnapshot).toBeNull();
  });

  it("after 3 recovers, further recover is denied", () => {
    const makeSnap = (tag: string) => ({
      board: Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) =>
          tile({
            id: `${tag}-${r}-${c}`,
            row: r,
            col: c,
            symbol: "square" as const,
            color: "indigo" as const,
          }),
        ),
      ),
      score: 10,
      combo: 1,
      undosLeft: 3,
      difficultyStage: 0,
      clearsCount: 0,
      stats: {
        loopsCreated: 0,
        largestLoop: 0,
        longestCombo: 0,
        totalConnections: 0,
      },
      moveCount: 0,
      dailySolved: false,
      gameOver: false,
      lastClearSize: null,
      lastScoreGain: null,
      closedLoop: false,
    });

    const stuckBoard = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) =>
        tile({
          id: `x${r}-${c}`,
          row: r,
          col: c,
          symbol: "circle",
          color: "coral",
          locked: true,
        }),
      ),
    );

    let state: GameState = {
      ...stateFromBoard(stuckBoard),
      gameOver: true,
      recoveryUndosLeft: 3,
      preClearSnapshot: makeSnap("a"),
    };
    state = reduce(state, { type: "RECOVER_UNDO" });
    expect(state.recoveryUndosLeft).toBe(2);

    state = {
      ...state,
      gameOver: true,
      board: stuckBoard,
      preClearSnapshot: makeSnap("b"),
    };
    state = reduce(state, { type: "RECOVER_UNDO" });
    expect(state.recoveryUndosLeft).toBe(1);

    state = {
      ...state,
      gameOver: true,
      board: stuckBoard,
      preClearSnapshot: makeSnap("c"),
    };
    state = reduce(state, { type: "RECOVER_UNDO" });
    expect(state.recoveryUndosLeft).toBe(0);
    expect(state.gameOver).toBe(false);

    // Softlock again with a snapshot but no charges left
    state = {
      ...state,
      gameOver: true,
      board: stuckBoard,
      preClearSnapshot: makeSnap("d"),
      message: "No moves left",
    };
    const denied = reduce(state, { type: "RECOVER_UNDO" });
    expect(denied.recoveryUndosLeft).toBe(0);
    expect(denied.gameOver).toBe(true);
    expect(denied.preClearSnapshot).not.toBeNull();

    const accepted = reduce(denied, { type: "ACCEPT_GAME_OVER" });
    expect(accepted.preClearSnapshot).toBeNull();
    expect(accepted.gameOver).toBe(true);
  });

  it("new endless game starts with 3 recovery undos and legal moves", () => {
    const state = newEndlessGame(42);
    expect(state.recoveryUndosLeft).toBe(3);
    expect(state.preClearSnapshot).toBeNull();
    expect(hasLegalMoves(state)).toBe(true);
    expect(state.gameOver).toBe(false);
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
    // Playable after clear → recovery snapshot discarded
    expect(state.preClearSnapshot).toBeNull();
    expect(state.gameOver).toBe(false);
    const afterUndo = reduce(state, { type: "UNDO" });
    expect(afterUndo.score).toBe(60);
    expect(afterUndo.stats.loopsCreated).toBe(1);
  });

  it("never exceeds max connections", () => {
    const state = newEndlessGame(99);
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
  it("has three staged boards and a shared move budget", () => {
    const easy = generateDailyBoard("2026-09-20", 0);
    const medium = generateDailyBoard("2026-09-20", 1);
    const hard = generateDailyBoard("2026-09-20", 2);
    expect(easy.difficulty).toBe("easy");
    expect(medium.difficulty).toBe("medium");
    expect(hard.difficulty).toBe("hard");
    expect(allTiles(easy.board).length).toBe(easy.tileCount);
    expect(easy.tileCount).toBeGreaterThanOrEqual(4);

    const state = newDailyGame("2026-09-20");
    expect(state.dailyStage).toBe(0);
    expect(state.dailyDate).toBe("2026-09-20");
    expect(state.dailyMoveLimit).toBe(30);
    expect(listLegalConnections(state).length).toBeGreaterThan(0);
  });

  it("rejects connections that are not on the longest path", () => {
    const state = newDailyGame("2026-09-21");
    const hint = suggestHint(state);
    expect(hint).not.toBeNull();
    // Find any legal edge not on the longest loop
    const edges = listLegalConnections(state);
    const off = edges.find(
      (e) => !isEdgeOnLongestLoop(state, e.a, e.b),
    );
    if (!off) {
      // All legal edges are on the longest path — still ok
      expect(hint!.edges.length).toBeGreaterThan(0);
      return;
    }
    const next = reduce(state, { type: "CONNECT", fromId: off.a, toId: off.b });
    expect(next.message).toBe("Only the longest path");
    expect(next.stats.totalConnections).toBe(state.stats.totalConnections);
  });
});

describe("always a route", () => {
  it("new boards always have a clearable 2x2", async () => {
    const { hasClearableTwoByTwo } = await import("@/game/routes");
    for (let i = 0; i < 50; i++) {
      const state = newEndlessGame((i * 99991) >>> 0);
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

  it("post-clear refill does not plant a rescue route", async () => {
    const { applyGravityAndRefill } = await import("@/game/board");
    const { hasClearableTwoByTwo } = await import("@/game/routes");
    const { createRng } = await import("@/game/rng");
    // Full locked board — no empties to refill; previously plant would unlock a 2x2
    const board = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) =>
        tile({
          id: `F${r}-${c}`,
          row: r,
          col: c,
          symbol: "circle",
          color: "coral",
          locked: true,
        }),
      ),
    );
    const refilled = applyGravityAndRefill(board, createRng(7), 0, true);
    expect(hasClearableTwoByTwo(refilled)).toBe(false);
    expect(refilled[0]![0]!.locked).toBe(true);
    expect(refilled[0]![0]!.id).toBe("F0-0");
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
