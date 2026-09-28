import {
  alreadyConnected,
  areNeighbors,
  canMatch,
  degreeFree,
  findTile,
  neighborsOf,
} from "@/game/board";
import type { GameState, Tile, TileId } from "@/types/game";

export type ConnectRejectReason =
  | "missing"
  | "same"
  | "locked"
  | "not_adjacent"
  | "no_match"
  | "full"
  | "exists";

export interface ConnectValidation {
  ok: boolean;
  reason?: ConnectRejectReason;
  from?: Tile;
  to?: Tile;
}

export function validateConnection(
  state: GameState,
  fromId: TileId,
  toId: TileId,
): ConnectValidation {
  const from = findTile(state.board, fromId);
  const to = findTile(state.board, toId);
  if (!from || !to) return { ok: false, reason: "missing" };
  if (from.id === to.id) return { ok: false, reason: "same" };
  if (from.locked || to.locked) return { ok: false, reason: "locked" };
  if (!areNeighbors(from, to)) return { ok: false, reason: "not_adjacent" };
  if (!canMatch(from, to)) return { ok: false, reason: "no_match" };
  if (!degreeFree(from) || !degreeFree(to))
    return { ok: false, reason: "full" };
  if (alreadyConnected(from, to)) return { ok: false, reason: "exists" };
  return { ok: true, from, to };
}

export function listLegalConnections(
  state: GameState,
): Array<{ a: TileId; b: TileId }> {
  const edges: Array<{ a: TileId; b: TileId }> = [];
  const seen = new Set<string>();

  for (const row of state.board) {
    for (const tile of row) {
      if (!tile || tile.locked || !degreeFree(tile)) continue;
      for (const n of neighborsOf(state.board, tile)) {
        if (tile.id >= n.id) continue;
        if (n.locked || !degreeFree(n)) continue;
        const key = `${tile.id}|${n.id}`;
        if (seen.has(key)) continue;
        const v = validateConnection(state, tile.id, n.id);
        if (v.ok) {
          seen.add(key);
          edges.push({ a: tile.id, b: n.id });
        }
      }
    }
  }

  return edges;
}
