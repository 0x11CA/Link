"use client";

import { useMemo } from "react";
import { findTile } from "@/game/board";
import { GRID_SIZE } from "@/game/config";
import type { Tile as TileModel } from "@/types/game";

interface ConnectionLayerProps {
  board: (TileModel | null)[][];
  clearingIds: string[];
  hintEdges?: Array<{ a: string; b: string }>;
  /** Ordered tile ids for the active continuous path. */
  pathIds?: string[];
  drawing?: boolean;
  cursor?: { x: number; y: number } | null;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function ConnectionLayer({
  board,
  clearingIds,
  hintEdges = [],
  pathIds = [],
  drawing = false,
  cursor = null,
}: ConnectionLayerProps) {
  const edges = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ a: TileModel; b: TileModel; key: string }> = [];
    for (const row of board) {
      for (const tile of row) {
        if (!tile) continue;
        for (const nid of tile.connections) {
          const key = edgeKey(tile.id, nid);
          if (seen.has(key)) continue;
          seen.add(key);
          const other = findTile(board, nid);
          if (other) list.push({ a: tile, b: other, key });
        }
      }
    }
    return list;
  }, [board]);

  const realKeys = useMemo(
    () => new Set(edges.map((e) => e.key)),
    [edges],
  );

  const clearing = new Set(clearingIds);
  const cell = 100 / GRID_SIZE;

  const pathPoints = pathIds
    .map((id) => findTile(board, id))
    .filter((t): t is TileModel => !!t)
    .map((t) => ({
      x: (t.col + 0.5) * cell,
      y: (t.row + 0.5) * cell,
    }));

  if (drawing && cursor && pathPoints.length > 0) {
    pathPoints.push(cursor);
  }

  const pathD =
    pathPoints.length > 0
      ? pathPoints
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
          .join(" ")
      : "";

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {hintEdges.map(({ a: aid, b: bid }) => {
        const key = edgeKey(aid, bid);
        if (realKeys.has(key)) return null;
        const a = findTile(board, aid);
        const b = findTile(board, bid);
        if (!a || !b) return null;
        return (
          <line
            key={`hint-${key}`}
            x1={(a.col + 0.5) * cell}
            y1={(a.row + 0.5) * cell}
            x2={(b.col + 0.5) * cell}
            y2={(b.row + 0.5) * cell}
            stroke="#2A9D8F"
            strokeOpacity={0.55}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeDasharray="3 2.5"
          />
        );
      })}
      {edges.map(({ a, b, key }) => {
        const x1 = (a.col + 0.5) * cell;
        const y1 = (a.row + 0.5) * cell;
        const x2 = (b.col + 0.5) * cell;
        const y2 = (b.row + 0.5) * cell;
        const glow = clearing.has(a.id) && clearing.has(b.id);
        const onPath =
          pathIds.includes(a.id) && pathIds.includes(b.id);
        return (
          <line
            key={key}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={glow || onPath ? "#2A9D8F" : "#1E2A32"}
            strokeOpacity={glow ? 0.85 : onPath ? 0.75 : 0.3}
            strokeWidth={glow ? 1.8 : onPath ? 1.7 : 1.15}
            strokeLinecap="round"
            className="animate-[drawLine_180ms_ease-out]"
            style={{
              filter: glow || onPath
                ? "drop-shadow(0 0 2px rgba(42,157,143,0.55))"
                : undefined,
            }}
          />
        );
      })}
      {pathD && (
        <path
          d={pathD}
          fill="none"
          stroke="#2A9D8F"
          strokeOpacity={0.35}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-[pathPulse_1.2s_ease-in-out_infinite]"
        />
      )}
    </svg>
  );
}
