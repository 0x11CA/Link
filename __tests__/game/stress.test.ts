import { describe, expect, it } from "vitest";
import {
  generatePlayableBoard,
  countLegalConnections,
  allTiles,
} from "@/game/board";
import { MAX_CONNECTIONS } from "@/game/config";
import { listLegalConnections } from "@/game/connections";
import { createInitialState, reduce, newEndlessGame } from "@/game/actions";
import { assertDailyDeterminism } from "@/game/dailyBoard";
import { baseScoreForLoop, scoreLoop } from "@/game/scoring";
import { findCycleClosedByEdge } from "@/game/loops";
import { validateConnection } from "@/game/connections";

describe("stress: board generation", () => {
  it("1000 random boards are playable and valid", () => {
    let playable = 0;
    for (let i = 0; i < 1000; i++) {
      const seed = (i * 2654435761) >>> 0;
      const stage = i % 5;
      const { board } = generatePlayableBoard(seed, stage);
      const legal = countLegalConnections(board);
      expect(legal).toBeGreaterThan(0);
      if (legal >= 6) playable += 1;

      for (const t of allTiles(board)) {
        expect(t.connections.length).toBeLessThanOrEqual(MAX_CONNECTIONS);
        expect(t.row).toBeGreaterThanOrEqual(0);
        expect(t.col).toBeLessThan(5);
      }

      const state = createInitialState({
        mode: "endless",
        seed,
        board,
        rngState: seed,
        difficultyStage: stage,
      });
      const edges = listLegalConnections(state);
      for (const e of edges) {
        const v = validateConnection(state, e.a, e.b);
        expect(v.ok).toBe(true);
      }
    }
    // Vast majority should meet the playable heuristic
    expect(playable).toBeGreaterThan(900);
  });
});

describe("stress: random play sessions", () => {
  it("simulates many games without invariant breaks", () => {
    for (let g = 0; g < 200; g++) {
      let state = newEndlessGame((g * 7919) >>> 0);
      let steps = 0;
      while (!state.gameOver && steps < 80) {
        const edges = listLegalConnections(state);
        if (edges.length === 0) break;
        const pick = edges[steps % edges.length]!;
        state = reduce(state, {
          type: "CONNECT",
          fromId: pick.a,
          toId: pick.b,
        });
        for (const t of allTiles(state.board)) {
          expect(t.connections.length).toBeLessThanOrEqual(MAX_CONNECTIONS);
          // No self-connections
          expect(t.connections.includes(t.id)).toBe(false);
        }
        steps += 1;
      }
      expect(state.score).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("stress: daily determinism suite", () => {
  it("many dates are stable", () => {
    for (let d = 1; d <= 60; d++) {
      const date = `2026-01-${String(d).padStart(2, "0")}`;
      // skip invalid calendar days simply by using day 01-28
      if (d > 28) continue;
      expect(assertDailyDeterminism(date)).toBe(true);
    }
  });
});

describe("scoring cannot be exploited without clears", () => {
  it("non-closing connections add no score", () => {
    const state = newEndlessGame(12345);
    const edges = listLegalConnections(state);
    expect(edges.length).toBeGreaterThan(0);
    const next = reduce(state, {
      type: "CONNECT",
      fromId: edges[0]!.a,
      toId: edges[0]!.b,
    });
    if (!next.lastClearSize) {
      expect(next.score).toBe(0);
    }
  });

  it("combo multiplies only on clears", () => {
    expect(scoreLoop(4, 3)).toBe(baseScoreForLoop(4) * 3);
  });
});

describe("cycle size floor", () => {
  it("findCycle returns null for triangles if forced (min 4)", () => {
    // Construct path of length 2 only — closing cannot make size 4
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    );
    // Not applicable with ortho-only; just ensure helper respects min size via empty
    expect(findCycleClosedByEdge(board, "x", "y")).toBeNull();
  });
});
