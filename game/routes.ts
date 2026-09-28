import {
  cloneBoard,
  colorPool,
  findTile,
  nextTileId,
  symbolPool,
  tileAt,
  canMatch,
  alreadyConnected,
  allTiles,
} from "@/game/board";
import { GRID_SIZE } from "@/game/config";
import { pick } from "@/game/rng";
import type { ColorId, SymbolId, Tile, TileId } from "@/types/game";

/**
 * Fast check: unlocked 2×2 that can form a matching 4-cycle.
 */
export function hasClearableTwoByTwo(board: (Tile | null)[][]): boolean {
  for (let r = 0; r < GRID_SIZE - 1; r++) {
    for (let c = 0; c < GRID_SIZE - 1; c++) {
      const tl = tileAt(board, r, c);
      const tr = tileAt(board, r, c + 1);
      const br = tileAt(board, r + 1, c + 1);
      const bl = tileAt(board, r + 1, c);
      if (!tl || !tr || !br || !bl) continue;
      if (tl.locked || tr.locked || br.locked || bl.locked) continue;
      if (
        canMatch(tl, tr) &&
        canMatch(tr, br) &&
        canMatch(br, bl) &&
        canMatch(bl, tl)
      ) {
        const square = [tl, tr, br, bl];
        // Each tile must have room for up to 2 cycle links
        if (
          square.every((t) => {
            const cycleNeighbors = square.filter(
              (o) =>
                o.id !== t.id &&
                ((Math.abs(o.row - t.row) === 1 && o.col === t.col) ||
                  (Math.abs(o.col - t.col) === 1 && o.row === t.row)),
            );
            const external = t.connections.filter(
              (id) => !cycleNeighbors.some((n) => n.id === id),
            );
            return external.length === 0 && t.connections.length <= 2;
          })
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function clearTileLinks(board: (Tile | null)[][], ids: Set<TileId>): void {
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      if (ids.has(cell.id)) cell.connections = [];
      else cell.connections = cell.connections.filter((id) => !ids.has(id));
    }
  }
}

export function plantGuaranteedLoop(
  board: (Tile | null)[][],
  rng: () => number,
  stage: number,
): (Tile | null)[][] {
  const next = cloneBoard(board);
  const symbols = symbolPool(stage);
  const colors = colorPool(stage);

  let bestR = 0;
  let bestC = 0;
  let bestScore = -Infinity;
  for (let r = 0; r < GRID_SIZE - 1; r++) {
    for (let c = 0; c < GRID_SIZE - 1; c++) {
      const cells = [
        tileAt(next, r, c),
        tileAt(next, r, c + 1),
        tileAt(next, r + 1, c + 1),
        tileAt(next, r + 1, c),
      ];
      let score = 0;
      for (const t of cells) {
        if (!t) score += 3;
        else {
          if (!t.locked) score += 2;
          if (t.connections.length === 0) score += 1;
        }
      }
      score += rng() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestR = r;
        bestC = c;
      }
    }
  }

  const sA = pick(rng, symbols);
  let sB = pick(rng, symbols);
  if (sB === sA && symbols.length > 1) {
    sB = symbols.find((s) => s !== sA) ?? sB;
  }
  const cA = pick(rng, colors);
  let cB = pick(rng, colors);
  if (cB === cA && colors.length > 1) {
    cB = colors.find((col) => col !== cA) ?? cB;
  }

  const pattern: Array<{
    r: number;
    c: number;
    symbol: SymbolId;
    color: ColorId;
  }> = [
    { r: bestR, c: bestC, symbol: sA, color: cA },
    { r: bestR, c: bestC + 1, symbol: sA, color: cB },
    { r: bestR + 1, c: bestC + 1, symbol: sB, color: cB },
    { r: bestR + 1, c: bestC, symbol: sB, color: cA },
  ];

  const ids = new Set<TileId>();
  for (const p of pattern) {
    const existing = next[p.r]![p.c];
    if (existing) ids.add(existing.id);
  }
  clearTileLinks(next, ids);

  for (const p of pattern) {
    const existing = next[p.r]![p.c];
    if (existing) {
      existing.symbol = p.symbol;
      existing.color = p.color;
      existing.locked = false;
      existing.wild = false;
      existing.bridge = false;
      existing.connections = [];
      existing.row = p.r;
      existing.col = p.c;
    } else {
      next[p.r]![p.c] = {
        id: nextTileId(),
        row: p.r,
        col: p.c,
        symbol: p.symbol,
        color: p.color,
        locked: false,
        wild: false,
        bridge: false,
        connections: [],
      };
    }
  }

  return next;
}

export function ensureCompletableRoute(
  board: (Tile | null)[][],
  rng: () => number,
  stage: number,
): (Tile | null)[][] {
  if (hasClearableTwoByTwo(board)) return board;
  return plantGuaranteedLoop(board, rng, stage);
}

export function occupiedCount(board: (Tile | null)[][]): number {
  return allTiles(board).length;
}

export { findTile, alreadyConnected };
