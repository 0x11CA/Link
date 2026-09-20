import { findTile } from "@/game/board";
import { MIN_LOOP_SIZE } from "@/game/config";
import type { Tile, TileId } from "@/types/game";

/**
 * After connecting `fromId` — `toId`, detect if that edge closed a cycle.
 * Returns the cycle tile ids (including both endpoints) or null.
 */
export function findCycleClosedByEdge(
  board: (Tile | null)[][],
  fromId: TileId,
  toId: TileId,
): TileId[] | null {
  const from = findTile(board, fromId);
  const to = findTile(board, toId);
  if (!from || !to) return null;

  // Path from `to` to `from` avoiding the new edge, then prepend the edge.
  const parent = new Map<TileId, TileId | null>();
  const queue: TileId[] = [toId];
  parent.set(toId, null);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const tile = findTile(board, cur);
    if (!tile) continue;

    for (const nextId of tile.connections) {
      // Skip traversing the brand-new edge directly as the only hop when
      // searching an alternate path — we want a path toId → … → fromId
      // that does not use the new edge.
      if (
        (cur === toId && nextId === fromId) ||
        (cur === fromId && nextId === toId)
      ) {
        continue;
      }
      if (parent.has(nextId)) continue;
      parent.set(nextId, cur);
      if (nextId === fromId) {
        const cycle: TileId[] = [fromId];
        let walk: TileId | null = cur;
        while (walk !== null) {
          cycle.push(walk);
          walk = parent.get(walk) ?? null;
        }
        // cycle is fromId → … → toId; closing edge toId→fromId implied
        if (cycle.length >= MIN_LOOP_SIZE) return cycle;
        return null;
      }
      queue.push(nextId);
    }
  }

  return null;
}

/** Detect any cycle in the connection graph (for tests / diagnostics). */
export function findAnyCycle(board: (Tile | null)[][]): TileId[] | null {
  const visited = new Set<TileId>();
  const inStack = new Set<TileId>();
  const parent = new Map<TileId, TileId | null>();

  const tiles: Tile[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell) tiles.push(cell);
    }
  }

  function dfs(id: TileId): TileId[] | null {
    visited.add(id);
    inStack.add(id);
    const tile = findTile(board, id);
    if (!tile) {
      inStack.delete(id);
      return null;
    }
    for (const next of tile.connections) {
      if (!visited.has(next)) {
        parent.set(next, id);
        const found = dfs(next);
        if (found) return found;
      } else if (inStack.has(next) && parent.get(id) !== next) {
        const cycle: TileId[] = [next];
        let cur: TileId | null = id;
        while (cur !== null && cur !== next) {
          cycle.push(cur);
          cur = parent.get(cur) ?? null;
        }
        cycle.push(next);
        if (cycle.length - 1 >= MIN_LOOP_SIZE) {
          return cycle.slice(0, -1);
        }
      }
    }
    inStack.delete(id);
    return null;
  }

  for (const t of tiles) {
    if (!visited.has(t.id)) {
      parent.set(t.id, null);
      const c = dfs(t.id);
      if (c) return c;
    }
  }
  return null;
}
