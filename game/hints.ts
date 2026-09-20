import {
  alreadyConnected,
  allTiles,
  canMatch,
  findTile,
} from "@/game/board";
import { GRID_SIZE, MIN_LOOP_SIZE } from "@/game/config";
import { validateConnection } from "@/game/connections";
import { scoreLoop } from "@/game/scoring";
import type { GameState, TileId } from "@/types/game";

export type HintSuggestion = {
  /** All tiles in the suggested loop (length ≥ 4). */
  tileIds: TileId[];
  /** Ordered cycle edges (including closing edge). */
  edges: Array<{ a: TileId; b: TileId }>;
  /** Best next connection to make toward completing this loop. */
  nextMove: { a: TileId; b: TileId } | null;
  /** Potential points if this loop is cleared at current combo. */
  potentialScore: number;
};

type AdjEdge = { to: TileId; existing: boolean };

/**
 * Build undirected adjacency of edges that can participate in a future loop:
 * already connected, or currently legal to connect.
 */
function buildPotentialGraph(
  state: GameState,
): Map<TileId, AdjEdge[]> {
  const graph = new Map<TileId, AdjEdge[]>();
  const tiles = allTiles(state.board);

  const add = (a: TileId, b: TileId, existing: boolean) => {
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a)!.push({ to: b, existing });
    graph.get(b)!.push({ to: a, existing });
  };

  const seen = new Set<string>();
  for (const tile of tiles) {
    if (tile.locked) continue;
    for (const other of tiles) {
      if (tile.id >= other.id) continue;
      if (other.locked) continue;
      const key = `${tile.id}|${other.id}`;
      if (seen.has(key)) continue;

      const dr = Math.abs(tile.row - other.row);
      const dc = Math.abs(tile.col - other.col);
      const ortho = (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
      if (!ortho) continue;
      if (!canMatch(tile, other)) continue;

      if (alreadyConnected(tile, other)) {
        seen.add(key);
        add(tile.id, other.id, true);
        continue;
      }

      if (validateConnection(state, tile.id, other.id).ok) {
        seen.add(key);
        add(tile.id, other.id, false);
      }
    }
  }

  return graph;
}

function cycleRespectsDegrees(state: GameState, cycle: TileId[]): boolean {
  const n = cycle.length;
  for (let i = 0; i < n; i++) {
    const id = cycle[i]!;
    const prev = cycle[(i - 1 + n) % n]!;
    const next = cycle[(i + 1) % n]!;
    const tile = findTile(state.board, id);
    if (!tile || tile.locked) return false;

    const cycleNeighbors = new Set([prev, next]);
    const external = tile.connections.filter((c) => !cycleNeighbors.has(c));
    if (external.length > 0) return false;

    const hasPrev = tile.connections.includes(prev);
    const hasNext = tile.connections.includes(next);
    const missing = (hasPrev ? 0 : 1) + (hasNext ? 0 : 1);
    if (tile.connections.length + missing > 2) return false;
  }
  return true;
}

function missingEdges(
  state: GameState,
  cycle: TileId[],
): Array<{ a: TileId; b: TileId }> {
  const missing: Array<{ a: TileId; b: TileId }> = [];
  const n = cycle.length;
  for (let i = 0; i < n; i++) {
    const a = cycle[i]!;
    const b = cycle[(i + 1) % n]!;
    const ta = findTile(state.board, a);
    const tb = findTile(state.board, b);
    if (!ta || !tb || !alreadyConnected(ta, tb)) {
      missing.push({ a, b });
    }
  }
  return missing;
}

/**
 * Rank loops by maximum opportunity:
 * 1) Highest potential score (size × combo)
 * 2) Highest completion ratio (already connected / size) — more achievable
 * 3) Fewer remaining links
 * 4) Larger size as tie-break
 */
function loopRank(
  size: number,
  missing: number,
  combo: number,
): number {
  const potential = scoreLoop(size, combo);
  const existing = size - missing;
  const completion = existing / size;
  // Prefer big scores; boost nearly-complete big loops heavily
  return potential * (1 + completion) * (1 + 1 / (1 + missing));
}

/**
 * Pick the missing edge that best continues an existing path segment
 * (endpoint of the longest run of already-connected edges in the cycle).
 */
function bestNextMove(
  state: GameState,
  cycle: TileId[],
  missing: Array<{ a: TileId; b: TileId }>,
): { a: TileId; b: TileId } | null {
  if (missing.length === 0) return null;
  if (missing.length === 1) return missing[0]!;

  const n = cycle.length;
  const isMissing = new Set(
    missing.map((e) => (e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`)),
  );

  // Find endpoints: tiles where one cycle neighbor is connected and one is missing
  let best: { a: TileId; b: TileId } | null = null;
  let bestScore = -1;

  for (let i = 0; i < n; i++) {
    const a = cycle[i]!;
    const b = cycle[(i + 1) % n]!;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!isMissing.has(key)) continue;

    const ta = findTile(state.board, a)!;
    const tb = findTile(state.board, b)!;
    const aDegree = ta.connections.length;
    const bDegree = tb.connections.length;
    // Prefer extending from a tile that already has one path connection
    const score = (aDegree === 1 ? 3 : 0) + (bDegree === 1 ? 3 : 0) + aDegree + bDegree;
    if (score > bestScore) {
      bestScore = score;
      best = { a, b };
    }
  }

  return best ?? missing[0]!;
}

/**
 * Suggest the maximum-opportunity completable loop on the board.
 */
export function suggestHint(state: GameState): HintSuggestion | null {
  const graph = buildPotentialGraph(state);
  const nodes = [...graph.keys()];
  if (nodes.length < MIN_LOOP_SIZE) return null;

  const combo = Math.max(1, state.combo);
  const maxDepth = GRID_SIZE * GRID_SIZE;

  const found: {
    cycle: TileId[] | null;
    rank: number;
    missing: number;
    size: number;
  } = {
    cycle: null,
    rank: -Infinity,
    missing: Infinity,
    size: 0,
  };

  const consider = (cycle: TileId[]) => {
    if (cycle.length < MIN_LOOP_SIZE) return;
    if (cycle.length % 2 !== 0) return; // ortho grid: only even cycles
    if (!cycleRespectsDegrees(state, cycle)) return;
    const missing = missingEdges(state, cycle).length;
    const rank = loopRank(cycle.length, missing, combo);
    if (
      rank > found.rank ||
      (rank === found.rank && missing < found.missing) ||
      (rank === found.rank &&
        missing === found.missing &&
        cycle.length > found.size)
    ) {
      found.rank = rank;
      found.missing = missing;
      found.size = cycle.length;
      found.cycle = [...cycle];
    }
  };

  for (const start of nodes) {
    const path: TileId[] = [start];
    const onPath = new Set<TileId>([start]);

    const dfs = (current: TileId) => {
      const neighbors = graph.get(current) ?? [];
      for (const { to } of neighbors) {
        if (to === start && path.length >= MIN_LOOP_SIZE) {
          const minId = path.reduce((m, id) => (id < m ? id : m), path[0]!);
          if (minId === start) consider(path);
          continue;
        }
        if (onPath.has(to)) continue;
        if (path.length >= maxDepth) continue;
        path.push(to);
        onPath.add(to);
        dfs(to);
        path.pop();
        onPath.delete(to);
      }
    };

    dfs(start);
  }

  if (!found.cycle) return null;

  const loop = found.cycle;
  const n = loop.length;
  const edges: Array<{ a: TileId; b: TileId }> = [];
  for (let i = 0; i < n; i++) {
    edges.push({ a: loop[i]!, b: loop[(i + 1) % n]! });
  }

  const missing = missingEdges(state, loop);

  return {
    tileIds: loop,
    edges,
    nextMove: bestNextMove(state, loop, missing),
    potentialScore: scoreLoop(n, combo),
  };
}
