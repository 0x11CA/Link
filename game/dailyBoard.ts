import { emptyBoard, nextTileId, resetTileSeq } from "@/game/board";
import { ALL_COLORS, ALL_SYMBOLS, GRID_SIZE } from "@/game/config";
import { createRng, hashString, pick } from "@/game/rng";
import type { ColorId, SymbolId, Tile } from "@/types/game";

export type DailyDifficulty = "easy" | "medium" | "hard";

export const DAILY_STAGE_LABELS: DailyDifficulty[] = [
  "easy",
  "medium",
  "hard",
];

export function dailySeed(dateStr: string): number {
  return hashString(`link-daily-v3-${dateStr}`);
}

function stageSeed(dateStr: string, stage: number): number {
  return hashString(`link-daily-v3-${dateStr}-s${stage}`);
}

export function dailyDifficultyForStage(stage: number): DailyDifficulty {
  return DAILY_STAGE_LABELS[Math.max(0, Math.min(2, stage))]!;
}

/**
 * Three-stage daily boards: easy → medium → hard.
 * Packed with decoys/specials; only the longest path is playable in-engine.
 */
export function generateDailyBoard(
  dateStr: string,
  stage = 0,
): {
  board: (Tile | null)[][];
  seed: number;
  rngState: number;
  tileCount: number;
  difficulty: DailyDifficulty;
} {
  const difficulty = dailyDifficultyForStage(stage);
  const seed = stageSeed(dateStr, stage);
  const rng = createRng(seed);
  resetTileSeq((seed % 90000) + stage * 1000);

  const board = emptyBoard();
  const symbolCount = difficulty === "easy" ? 2 : difficulty === "medium" ? 3 : 4;
  const colorCount = difficulty === "easy" ? 2 : difficulty === "medium" ? 3 : 4;
  const symbols = ALL_SYMBOLS.slice(0, symbolCount);
  const colors = ALL_COLORS.slice(0, colorCount);

  // Primary longest loop size: 4 / 6 / 8
  const loopSize = difficulty === "easy" ? 4 : difficulty === "medium" ? 6 : 8;
  placePrimaryLoop(board, loopSize, symbols, colors, rng);

  // Extra shorter loops as bait (cannot be linked — engine blocks non-longest)
  const baitLoops =
    difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
  for (let i = 0; i < baitLoops; i++) {
    tryPlaceBaitSquare(board, symbols, colors, rng);
  }

  // Fill remaining empties with denser decoys on harder stages
  const decoyTarget =
    difficulty === "easy" ? 2 : difficulty === "medium" ? 5 : 8;
  placeDecoys(board, decoyTarget, symbols, colors, rng);

  // Specials scale up
  const lockRate =
    difficulty === "easy" ? 0.05 : difficulty === "medium" ? 0.12 : 0.2;
  const wildRate =
    difficulty === "easy" ? 0.08 : difficulty === "medium" ? 0.12 : 0.18;
  const bridgeRate =
    difficulty === "easy" ? 0.05 : difficulty === "medium" ? 0.1 : 0.16;
  applySpecials(board, lockRate, wildRate, bridgeRate, rng);

  let tileCount = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell) tileCount += 1;
    }
  }

  return {
    board,
    seed,
    rngState: Math.floor(rng() * 1e9),
    tileCount,
    difficulty,
  };
}

/** Total move budget across easy + medium + hard. */
export function dailyMoveLimitFor(_tileCount?: number): number {
  // Easy ~6 links, medium ~8, hard ~10, plus a few mistakes
  return 6 + 8 + 10 + 6;
}

export function assertDailyDeterminism(dateStr: string): boolean {
  for (let stage = 0; stage < 3; stage++) {
    const a = generateDailyBoard(dateStr, stage);
    const b = generateDailyBoard(dateStr, stage);
    const flat = (board: (Tile | null)[][]) =>
      board
        .flat()
        .map((t) =>
          t
            ? `${t.symbol}:${t.color}:${t.locked ? "L" : ""}${t.wild ? "W" : ""}${t.bridge ? "B" : ""}`
            : "x",
        )
        .join("|");
    if (flat(a.board) !== flat(b.board) || a.seed !== b.seed) return false;
  }
  return true;
}

function placePrimaryLoop(
  board: (Tile | null)[][],
  size: number,
  symbols: SymbolId[],
  colors: ColorId[],
  rng: () => number,
): void {
  // Even ortho cycles on a ring: 4 = 2×2, 6 = 2×3 rect, 8 = 3×3 ring (no center)
  if (size <= 4) {
    const r = Math.floor(rng() * (GRID_SIZE - 1));
    const c = Math.floor(rng() * (GRID_SIZE - 1));
    placeLoopSquare(board, r, c, symbols, colors, rng);
    return;
  }
  if (size <= 6) {
    const r = Math.floor(rng() * (GRID_SIZE - 1));
    const c = Math.floor(rng() * (GRID_SIZE - 2));
    placeRectLoop(board, r, c, 2, 3, symbols, colors, rng);
    return;
  }
  // 8-cycle: 3×3 ring
  const r = Math.floor(rng() * (GRID_SIZE - 2));
  const c = Math.floor(rng() * (GRID_SIZE - 2));
  placeRing8(board, r, c, symbols, colors, rng);
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
  if (sB === sA && symbols.length > 1) {
    sB = symbols.find((s) => s !== sA) ?? sB;
  }
  const cA = pick(rng, colors);
  let cB = pick(rng, colors);
  if (cB === cA && colors.length > 1) {
    cB = colors.find((c) => c !== cA) ?? cB;
  }
  const cells = [
    { r: row, c: col, symbol: sA, color: cA },
    { r: row, c: col + 1, symbol: sA, color: cB },
    { r: row + 1, c: col + 1, symbol: sB, color: cB },
    { r: row + 1, c: col, symbol: sB, color: cA },
  ];
  writeCells(board, cells);
}

/** 2×3 rectangle perimeter = 6 tiles. */
function placeRectLoop(
  board: (Tile | null)[][],
  row: number,
  col: number,
  h: number,
  w: number,
  symbols: SymbolId[],
  colors: ColorId[],
  rng: () => number,
): void {
  const path: Array<{ r: number; c: number }> = [];
  for (let c = 0; c < w; c++) path.push({ r: row, c: col + c });
  for (let r = 1; r < h; r++) path.push({ r: row + r, c: col + w - 1 });
  for (let c = w - 2; c >= 0; c--) path.push({ r: row + h - 1, c: col + c });
  for (let r = h - 2; r >= 1; r--) path.push({ r: row + r, c: col });
  paintPathMatches(board, path, symbols, colors, rng);
}

/** 3×3 outer ring = 8 tiles. */
function placeRing8(
  board: (Tile | null)[][],
  row: number,
  col: number,
  symbols: SymbolId[],
  colors: ColorId[],
  rng: () => number,
): void {
  const path = [
    { r: row, c: col },
    { r: row, c: col + 1 },
    { r: row, c: col + 2 },
    { r: row + 1, c: col + 2 },
    { r: row + 2, c: col + 2 },
    { r: row + 2, c: col + 1 },
    { r: row + 2, c: col },
    { r: row + 1, c: col },
  ];
  paintPathMatches(board, path, symbols, colors, rng);
}

/** Assign symbols/colors so consecutive path tiles always match. */
function paintPathMatches(
  board: (Tile | null)[][],
  path: Array<{ r: number; c: number }>,
  symbols: SymbolId[],
  colors: ColorId[],
  rng: () => number,
): void {
  const n = path.length;
  const cells: Array<{
    r: number;
    c: number;
    symbol: SymbolId;
    color: ColorId;
  }> = [];
  let symbol = pick(rng, symbols);
  let color = pick(rng, colors);
  for (let i = 0; i < n; i++) {
    const p = path[i]!;
    cells.push({ r: p.r, c: p.c, symbol, color });
    // Next edge: flip either symbol or color so neighbors match on one attribute
    if (i < n - 1) {
      if (rng() < 0.5) {
        const next = symbols.find((s) => s !== symbol) ?? pick(rng, symbols);
        symbol = next;
      } else {
        const next = colors.find((c) => c !== color) ?? pick(rng, colors);
        color = next;
      }
    }
  }
  // Closing edge path[n-1] → path[0]: ensure match
  const first = cells[0]!;
  const last = cells[n - 1]!;
  if (last.symbol !== first.symbol && last.color !== first.color) {
    last.color = first.color;
  }
  writeCells(board, cells);
}

function writeCells(
  board: (Tile | null)[][],
  cells: Array<{ r: number; c: number; symbol: SymbolId; color: ColorId }>,
): void {
  for (const cell of cells) {
    if (cell.r < 0 || cell.c < 0 || cell.r >= GRID_SIZE || cell.c >= GRID_SIZE)
      continue;
    board[cell.r]![cell.c] = {
      id: nextTileId(),
      row: cell.r,
      col: cell.c,
      symbol: cell.symbol,
      color: cell.color,
      locked: false,
      wild: false,
      bridge: false,
      connections: [],
    };
  }
}

function tryPlaceBaitSquare(
  board: (Tile | null)[][],
  symbols: SymbolId[],
  colors: ColorId[],
  rng: () => number,
): void {
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = Math.floor(rng() * (GRID_SIZE - 1));
    const c = Math.floor(rng() * (GRID_SIZE - 1));
    if (
      board[r]![c] ||
      board[r]![c + 1] ||
      board[r + 1]![c] ||
      board[r + 1]![c + 1]
    ) {
      continue;
    }
    placeLoopSquare(board, r, c, symbols, colors, rng);
    return;
  }
}

function placeDecoys(
  board: (Tile | null)[][],
  count: number,
  symbols: SymbolId[],
  colors: ColorId[],
  rng: () => number,
): void {
  const empties: Array<[number, number]> = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!board[r]![c]) empties.push([r, c]);
    }
  }
  for (let i = 0; i < count && empties.length > 0; i++) {
    const idx = Math.floor(rng() * empties.length);
    const [r, c] = empties.splice(idx, 1)[0]!;
    const neighbor = pickNeighborTile(board, r, c, rng);
    const symbol =
      neighbor && rng() < 0.6 ? neighbor.symbol : pick(rng, symbols);
    let color = pick(rng, colors);
    if (neighbor && rng() < 0.55) {
      color =
        symbol === neighbor.symbol
          ? pick(
              rng,
              colors.filter((x) => x !== neighbor.color).length
                ? colors.filter((x) => x !== neighbor.color)
                : colors,
            )
          : neighbor.color;
    }
    board[r]![c] = {
      id: nextTileId(),
      row: r,
      col: c,
      symbol,
      color,
      locked: false,
      wild: false,
      bridge: false,
      connections: [],
    };
  }
}

function applySpecials(
  board: (Tile | null)[][],
  lockRate: number,
  wildRate: number,
  bridgeRate: number,
  rng: () => number,
): void {
  const tiles = board.flat().filter((t): t is Tile => !!t);
  for (const t of tiles) {
    if (rng() < lockRate) t.locked = true;
  }
  const free = tiles.filter((t) => !t.locked);
  for (const t of free) {
    if (rng() < wildRate) t.wild = true;
    else if (rng() < bridgeRate) t.bridge = true;
  }
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
