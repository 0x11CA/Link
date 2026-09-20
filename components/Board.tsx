"use client";

import { useCallback, useRef, useState } from "react";
import { ConnectionLayer } from "@/components/ConnectionLayer";
import { Tile } from "@/components/Tile";
import { GRID_SIZE } from "@/game/config";
import type { GameState } from "@/types/game";

interface BoardProps {
  state: GameState;
  pathIds: string[];
  drawing: boolean;
  rejectId: string | null;
  onPathStart: (tileId: string) => void;
  onPathMove: (tileId: string) => void;
  onPathEnd: () => void;
  highlightIds?: string[];
  hintEdges?: Array<{ a: string; b: string }>;
}

export function Board({
  state,
  pathIds,
  drawing,
  rejectId,
  onPathStart,
  onPathMove,
  onPathEnd,
  highlightIds = [],
  hintEdges = [],
}: BoardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const hitTileId = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const hit = el.closest("[data-tile-id]") as HTMLElement | null;
    return hit?.dataset.tileId ?? null;
  }, []);

  const toSvgCursor = useCallback((clientX: number, clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const startStroke = useCallback(
    (tileId: string, e: React.PointerEvent) => {
      if (state.gameOver || state.dailySolved) return;
      drawingRef.current = true;
      rootRef.current?.setPointerCapture(e.pointerId);
      onPathStart(tileId);
      setCursor(toSvgCursor(e.clientX, e.clientY));
    },
    [state.gameOver, state.dailySolved, onPathStart, toSvgCursor],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      setCursor(toSvgCursor(e.clientX, e.clientY));
      const id = hitTileId(e.clientX, e.clientY);
      if (id) onPathMove(id);
    },
    [hitTileId, onPathMove, toSvgCursor],
  );

  const endStroke = useCallback(
    (e?: React.PointerEvent) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (e && rootRef.current?.hasPointerCapture(e.pointerId)) {
        rootRef.current.releasePointerCapture(e.pointerId);
      }
      setCursor(null);
      onPathEnd();
    },
    [onPathEnd],
  );

  const clearing = state.lastClearedIds;
  const head = pathIds[pathIds.length - 1] ?? null;

  return (
    <div
      ref={rootRef}
      className="relative mx-auto w-full max-w-[min(92vw,420px)] touch-none select-none"
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endStroke(e)}
      onPointerCancel={(e) => endStroke(e)}
    >
      <div
        ref={gridRef}
        className="relative grid gap-2 rounded-[1.5rem] bg-[#ECEAE6]/70 p-2.5 shadow-inner"
        style={{
          gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
        }}
      >
        <ConnectionLayer
          board={state.board}
          clearingIds={clearing}
          hintEdges={hintEdges}
          pathIds={pathIds}
          drawing={drawing}
          cursor={cursor}
        />
        {state.board.map((row, r) =>
          row.map((cell, c) => {
            if (!cell) {
              return (
                <div
                  key={`empty-${r}-${c}`}
                  className="aspect-square rounded-2xl bg-transparent"
                />
              );
            }
            return (
              <div
                key={cell.id}
                data-tile-id={cell.id}
                className="min-h-0"
                onPointerDown={(e) => {
                  e.preventDefault();
                  startStroke(cell.id, e);
                }}
              >
                <Tile
                  tile={cell}
                  selected={false}
                  inPath={pathIds.includes(cell.id)}
                  pathHead={head === cell.id}
                  highlighted={highlightIds.includes(cell.id)}
                  clearing={clearing.includes(cell.id)}
                  rejectShake={rejectId === cell.id}
                />
              </div>
            );
          }),
        )}
      </div>
      {state.lastScoreGain ? (
        <div
          key={`${state.clearsCount}-${state.lastScoreGain}`}
          className="pointer-events-none absolute left-1/2 top-1/3 z-20 -translate-x-1/2 animate-[floatScore_700ms_ease-out_forwards] text-2xl font-semibold text-[#2A9D8F]"
        >
          +{state.lastScoreGain}
        </div>
      ) : null}
    </div>
  );
}
