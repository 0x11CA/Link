import {
  ADJACENCY_OFFSETS,
  ALL_COLORS,
  ALL_SYMBOLS,
  BOARD_GEN_MAX_ATTEMPTS,
  CLEARS_PER_STAGE,
  DIFFICULTY_STAGES,
  GRID_SIZE,
  MAX_CONNECTIONS,
} from "@/game/config";
import { chance, createRng, pick } from "@/game/rng";
import type { ColorId, SymbolId, Tile, TileId } from "@/types/game";

let tileSeq = 0;

export function resetTileSeq(start = 0): void {
  tileSeq = start;
}

export function nextTileId(): TileId {
  tileSeq += 1;
  return `t${tileSeq}`;
}

export function cloneTile(tile: Tile): Tile {
  return {
    ...tile,
    connections: [...tile.connections],
  };
}

export function cloneBoard(board: (Tile | null)[][]): (Tile | null)[][] {
  return board.map((row) => row.map((cell) => (cell ? cloneTile(cell) : null)));
}

export function getStageConfig(stage: number) {
  const idx = Math.min(Math.max(stage, 0), DIFFICULTY_STAGES.length - 1);
  return DIFFICULTY_STAGES[idx]!;
}

export function stageFromClears(clears: number): number {
  return Math.min(
    Math.floor(clears / CLEARS_PER_STAGE),
    DIFFICULTY_STAGES.length - 1,
  );
}

export function symbolPool(stage: number): SymbolId[] {
  const n = getStageConfig(stage).symbols;
  return ALL_SYMBOLS.slice(0, n);
}

export function colorPool(stage: number): ColorId[] {
  const n = getStageConfig(stage).colors;
  return ALL_COLORS.slice(0, n);
}

export function createTile(
  row: number,
  col: number,
  rng: () => number,
  stage: number,
  options?: { forceNormal?: boolean },
): Tile {
  const cfg = getStageConfig(stage);
  const symbols = symbolPool(stage);
  const colors = colorPool(stage);

  let wild = false;
  let locked = false;
  if (!options?.forceNormal) {
    if (chance(rng, cfg.wildRate)) wild = true;
    else if (chance(rng, cfg.lockRate)) locked = true;
  }

  return {
    id: nextTileId(),
    row,
    col,
    symbol: pick(rng, symbols),
    color: pick(rng, colors),
    locked,
    wild,
    connections: [],
  };
}

export function emptyBoard(): (Tile | null)[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  );
}

export function fillBoard(
  rng: () => number,
  stage: number,
  forceNormal = true,
): (Tile | null)[][] {
  const board = emptyBoard();
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      board[r]![c] = createTile(r, c, rng, stage, {
        forceNormal,
      });
    }
  }
  return board;
}

export function tileAt(
  board: (Tile | null)[][],
  row: number,
  col: number,
): Tile | null {
  if (row < 0 || col < 0 || row >= GRID_SIZE || col >= GRID_SIZE) return null;
  return board[row]![col] ?? null;
}

export function findTile(
  board: (Tile | null)[][],
  id: TileId,
): Tile | null {
  for (const row of board) {
    for (const cell of row) {
      if (cell?.id === id) return cell;
    }
  }
  return null;
}

export function allTiles(board: (Tile | null)[][]): Tile[] {
  const out: Tile[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell) out.push(cell);
    }
  }
  return out;
}

export function areOrthogonalNeighbors(a: Tile, b: Tile): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

export function neighborsOf(board: (Tile | null)[][], tile: Tile): Tile[] {
  const result: Tile[] = [];
  for (const [dr, dc] of ADJACENCY_OFFSETS) {
    const n = tileAt(board, tile.row + dr, tile.col + dc);
    if (n) result.push(n);
  }
  return result;
}

export function canMatch(a: Tile, b: Tile): boolean {
  if (a.wild || b.wild) return true;
  return a.symbol === b.symbol || a.color === b.color;
}

export function degreeFree(tile: Tile): boolean {
  return tile.connections.length < MAX_CONNECTIONS;
}

export function alreadyConnected(a: Tile, b: Tile): boolean {
  return a.connections.includes(b.id);
}

/** Count potential legal connections on a fresh board (no existing edges). */
export function countLegalConnections(board: (Tile | null)[][]): number {
  const tiles = allTiles(board);
  let count = 0;
  for (let i = 0; i < tiles.length; i++) {
    const a = tiles[i]!;
    if (a.locked) continue;
    for (const b of neighborsOf(board, a)) {
      if (a.id >= b.id) continue;
      if (b.locked) continue;
      if (canMatch(a, b)) count += 1;
    }
  }
  return count;
}

/**
 * Heuristic: board should have enough matching orthogonal pairs that a 4-cycle
 * is plausible (at least 6 legal edges on a fresh board).
 */
export function boardLooksPlayable(board: (Tile | null)[][]): boolean {
  return countLegalConnections(board) >= 6;
}

export function generatePlayableBoard(
  seed: number,
  stage: number,
  options?: { allowSpecials?: boolean },
): { board: (Tile | null)[][]; rngState: number } {
  resetTileSeq(seed % 100000);
  let attempt = 0;
  let localSeed = seed;

  while (attempt < BOARD_GEN_MAX_ATTEMPTS) {
    const rng = createRng(localSeed);
    const board = fillBoard(rng, stage, !options?.allowSpecials);
    if (boardLooksPlayable(board)) {
      // Drain one more call so callers can continue from a derived state.
      const leftover = Math.floor(rng() * 1e9);
      return { board, rngState: leftover ^ localSeed };
    }
    attempt += 1;
    localSeed = (localSeed + 0x9e3779b9 + attempt) >>> 0;
  }

  // Fallback: forced diverse board
  const rng = createRng(seed);
  const board = fillBoard(rng, stage, true);
  return { board, rngState: (seed ^ 0xabcdef) >>> 0 };
}

export function applyGravityAndRefill(
  board: (Tile | null)[][],
  rng: () => number,
  stage: number,
  allowSpecials: boolean,
): (Tile | null)[][] {
  const next = emptyBoard();

  for (let c = 0; c < GRID_SIZE; c++) {
    const stack: Tile[] = [];
    for (let r = GRID_SIZE - 1; r >= 0; r--) {
      const cell = board[r]![c];
      if (cell) stack.push(cell);
    }
    let writeRow = GRID_SIZE - 1;
    for (const tile of stack) {
      const moved = cloneTile(tile);
      moved.row = writeRow;
      moved.col = c;
      next[writeRow]![c] = moved;
      writeRow -= 1;
    }
    while (writeRow >= 0) {
      next[writeRow]![c] = createTile(writeRow, c, rng, stage, {
        forceNormal: !allowSpecials,
      });
      writeRow -= 1;
    }
  }

  return next;
}

export function unlockAdjacentToCleared(
  board: (Tile | null)[][],
  clearedIds: Set<TileId>,
): (Tile | null)[][] {
  const next = cloneBoard(board);
  const clearedPositions: Array<{ row: number; col: number }> = [];

  // Positions of cleared tiles from previous board geometry aren't on next;
  // callers pass board BEFORE removal with cleared cells still present, or
  // we unlock by neighbor of removed positions stored separately.
  for (const row of board) {
    for (const cell of row) {
      if (cell && clearedIds.has(cell.id)) {
        clearedPositions.push({ row: cell.row, col: cell.col });
      }
    }
  }

  for (const pos of clearedPositions) {
    for (const [dr, dc] of ADJACENCY_OFFSETS) {
      const n = tileAt(next, pos.row + dr, pos.col + dc);
      if (n && n.locked && !clearedIds.has(n.id)) {
        const t = findTile(next, n.id);
        if (t) t.locked = false;
      }
    }
  }

  return next;
}

export function removeTiles(
  board: (Tile | null)[][],
  ids: Set<TileId>,
): (Tile | null)[][] {
  const next = cloneBoard(board);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = next[r]![c];
      if (cell && ids.has(cell.id)) {
        next[r]![c] = null;
      } else if (cell) {
        cell.connections = cell.connections.filter((id) => !ids.has(id));
      }
    }
  }
  return next;
}
