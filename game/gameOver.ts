import { allTiles, findTile } from "@/game/board";
import { listLegalConnections } from "@/game/connections";
import { MIN_LOOP_SIZE } from "@/game/config";
import type { GameState, TileId } from "@/types/game";

/**
 * Game over when no legal connections remain.
 * Additionally, if every legal edge cannot participate in any future cycle
 * given degree caps, we still only hard-end on zero legal moves (conservative).
 */
export function hasLegalMoves(state: GameState): boolean {
  return listLegalConnections(state).length > 0;
}

/**
 * Soft check: is there any simple cycle possible among currently connected
 * components with free stubs that can still close via legal matches?
 * Used for diagnostics / daily solvability heuristics.
 */
export function boardHasCyclePotential(state: GameState): boolean {
  if (!hasLegalMoves(state)) return false;

  // If any component already has a near-cycle (path length >= MIN_LOOP_SIZE - 1
  // between two free stubs that can legally connect), potential exists.
  const tiles = allTiles(state.board);
  for (const start of tiles) {
    if (start.locked) continue;
    if (start.connections.length === 0) continue;

    const dist = new Map<TileId, number>();
    const q: TileId[] = [start.id];
    dist.set(start.id, 0);
    while (q.length) {
      const id = q.shift()!;
      const t = findTile(state.board, id);
      if (!t) continue;
      const d = dist.get(id)!;
      for (const n of t.connections) {
        if (dist.has(n)) continue;
        dist.set(n, d + 1);
        q.push(n);
      }
    }

    for (const [id, d] of dist) {
      if (id === start.id) continue;
      if (d + 1 < MIN_LOOP_SIZE) continue;
      const other = findTile(state.board, id);
      if (!other) continue;
      // Would closing start-other be a legal new edge?
      const probe = listLegalConnections(state).some(
        (e) =>
          (e.a === start.id && e.b === other.id) ||
          (e.b === start.id && e.a === other.id),
      );
      if (probe) return true;
    }
  }

  // Fresh board with legal matches still has potential
  return hasLegalMoves(state);
}

export function isGameOver(state: GameState): boolean {
  if (state.mode === "daily") {
    if (state.dailySolved) return false;
    if (state.dailyFailed) return true;
  }
  return !hasLegalMoves(state);
}
