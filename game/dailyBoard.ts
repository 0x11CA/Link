import { emptyBoard, nextTileId, resetTileSeq } from "@/game/board";
import { ALL_COLORS, ALL_SYMBOLS, GRID_SIZE } from "@/game/config";
import { createRng, hashString, pick } from "@/game/rng";
import type { ColorId, SymbolId, Tile } from "@/types/game";

export function dailySeed(dateStr: string): number {
  return hashString(`link-daily-v2-${dateStr}`);
}

/**
 * Harder daily: 3 clearable 2×2 loops (12 tiles) + decoy tiles that tempt
 * wrong links, plus optional locks. Move budget is tight (see config).
 */
export function generateDailyBoard(dateStr: string): {
  board: (Tile | null)[][];
  seed: number;
  rngState: number;
  tileCount: number;
} {
  const seed = dailySeed(dateStr);
  const rng = createRng(seed);
  resetTileSeq(seed % 100000);

  const board = emptyBoard();
  const symbols = ALL_SYMBOLS.slice(0, 3);
  const colors = ALL_COLORS.slice(0, 3);

  // Three non-overlapping 2×2 slots on the 5×5
  const slots: Array<[number, number]> = [
    [0, 0],
    [0, 3],
    [3, 0],
    [3, 3],
    [0, 2],
    [2, 0],
    [2, 3],
    [3, 2],
  ];

  const chosen: Array<[number, number]> = [];
  let guard = 0;
  while (chosen.length < 3 && guard < 40) {
    guard += 1;
    const candidate = slots[Math.floor(rng() * slots.length)]!;
    if (chosen.some((c) => blocksOverlap(c, candidate))) continue;
    chosen.push(candidate);
  }
  // Fallback if RNG was unlucky
  while (chosen.length < 3) {
    for (const s of slots) {
      if (chosen.some((c) => blocksOverlap(c, s))) continue;
      chosen.push(s);
      if (chosen.length >= 3) break;
    }
    break;
  }

  for (const [r, c] of chosen) {
    placeLoopSquare(board, r, c, symbols, colors, rng);
  }

  // Decoy tiles in remaining empty cells — look tempting but pollute paths
  const empties: Array<[number, number]> = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!board[r]![c]) empties.push([r, c]);
    }
  }

  // Place 3–5 decoys
  const decoyCount = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < decoyCount && empties.length > 0; i++) {
    const idx = Math.floor(rng() * empties.length);
    const [r, c] = empties.splice(idx, 1)[0]!;
    const neighbor = pickNeighborTile(board, r, c, rng);
    // Often share one attribute with a neighbor to bait a dead-end link
    const symbol =
      neighbor && rng() < 0.55
        ? neighbor.symbol
        : pick(rng, symbols);
    const color =
      neighbor && rng() < 0.55 && symbol === neighbor.symbol
        ? pick(
            rng,
            colors.filter((x) => x !== neighbor.color).length > 0
              ? colors.filter((x) => x !== neighbor.color)
              : colors,
          )
        : neighbor && rng() < 0.6
          ? neighbor.color
          : pick(rng, colors);

    board[r]![c] = {
      id: nextTileId(),
      row: r,
      col: c,
      symbol,
      color: color ?? pick(rng, colors),
      locked: false,
      wild: false,
      connections: [],
    };
  }

  // 0–2 locked tiles on decoys or loop corners (must clear beside them)
  const candidates = board.flat().filter((t): t is Tile => !!t);
  const lockCount = Math.floor(rng() * 3); // 0, 1, or 2
  for (let i = 0; i < lockCount && candidates.length > 0; i++) {
    const idx = Math.floor(rng() * candidates.length);
    const t = candidates.splice(idx, 1)[0]!;
    t.locked = true;
  }

  let tileCount = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell) tileCount += 1;
    }
  }

  return { board, seed, rngState: Math.floor(rng() * 1e9), tileCount };
}

function pickNeighborTile(
  board: (Tile | null)[][],
  row: number,
  col: number,
  rng: () => number,
): Tile | null {
  const opts: Tile[] = [];
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const t = board[row + dr]?.[col + dc];
    if (t) opts.push(t);
  }
  if (opts.length === 0) return null;
  return opts[Math.floor(rng() * opts.length)]!;
}

function blocksOverlap(a: [number, number], b: [number, number]): boolean {
  return !(
    a[0] + 1 < b[0] ||
    b[0] + 1 < a[0] ||
    a[1] + 1 < b[1] ||
    b[1] + 1 < a[1]
  );
}

function placeLoopSquare(
  board: (Tile | null)[][],
  row: number,
  col: number,
  symbols: SymbolId[],
  colors: ColorId[],
  rng: () => number,
): void {
  const sA = pick(rng, symbols);
  let sB = pick(rng, symbols);
  // Prefer different symbols on opposite corners for clearer 4-cycle via colors
  if (sB === sA && symbols.length > 1) {
    sB = symbols.find((s) => s !== sA) ?? sB;
  }
  const cA = pick(rng, colors);
  let cB = pick(rng, colors);
  if (cB === cA && colors.length > 1) {
    cB = colors.find((c) => c !== cA) ?? cB;
  }
  const cells: Array<{
    r: number;
    c: number;
    symbol: SymbolId;
    color: ColorId;
  }> = [
    { r: row, c: col, symbol: sA, color: cA },
    { r: row, c: col + 1, symbol: sA, color: cB },
    { r: row + 1, c: col + 1, symbol: sB, color: cB },
    { r: row + 1, c: col, symbol: sB, color: cA },
  ];
  for (const cell of cells) {
    board[cell.r]![cell.c] = {
      id: nextTileId(),
      row: cell.r,
      col: cell.c,
      symbol: cell.symbol,
      color: cell.color,
      locked: false,
      wild: false,
      connections: [],
    };
  }
}

export function assertDailyDeterminism(dateStr: string): boolean {
  const a = generateDailyBoard(dateStr);
  const b = generateDailyBoard(dateStr);
  const flat = (board: (Tile | null)[][]) =>
    board
      .flat()
      .map((t) => (t ? `${t.symbol}:${t.color}:${t.locked ? "L" : ""}` : "x"))
      .join("|");
  return flat(a.board) === flat(b.board) && a.seed === b.seed;
}

/** Tight move budget: enough for the three 4-loops, almost no waste. */
export function dailyMoveLimitFor(tileCount: number): number {
  // Three guaranteed 4-loops need 12 links; decoys add pressure.
  // Allow only 1–2 mistakes depending on density.
  const base = 12;
  const extra = tileCount > 15 ? 1 : 0;
  return base + extra;
}
