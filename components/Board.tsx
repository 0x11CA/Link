"use client";

import { useCallback, useRef, useState } from "react";
import { ConnectionLayer } from "@/components/ConnectionLayer";
import { ClearFx } from "@/components/ClearFx";
import { Tile } from "@/components/Tile";
import { GRID_SIZE } from "@/game/config";
import { isFeverCombo } from "@/game/scoring";
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
  /** Animated solution guide — ordered tile ids revealed so far. */
  guidePath?: string[];
  guideActive?: boolean;
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
  guidePath = [],
  guideActive = false,
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
      if (state.gameOver || state.dailySolved || guideActive) return;
      drawingRef.current = true;
      rootRef.current?.setPointerCapture(e.pointerId);
      onPathStart(tileId);
      setCursor(toSvgCursor(e.clientX, e.clientY));
    },
    [state.gameOver, state.dailySolved, guideActive, onPathStart, toSvgCursor],
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
  const guideHead =
    guidePath.length > 0 ? guidePath[guidePath.length - 1]! : null;

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
        className={[
          "relative grid gap-0 overflow-hidden rounded-[1.25rem] p-1.5 shadow-inner",
          isFeverCombo(state.combo) ? "animate-[feverPulse_1.4s_ease-in-out_infinite]" : "",
        ].join(" ")}
        style={{
          gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
          background: "#C4B8A8",
        }}
      >
        <ConnectionLayer
          board={state.board}
          clearingIds={clearing}
          hintEdges={hintEdges}
          pathIds={pathIds}
          drawing={drawing}
          cursor={cursor}
          guidePath={guidePath}
        />
        {state.board.map((row, r) =>
          row.map((cell, c) => {
            const isLight = (r + c) % 2 === 0;
            const squareBg = isLight ? "#EDE6DC" : "#B7A894";
            if (!cell) {
              return (
                <div
                  key={`empty-${r}-${c}`}
                  className="aspect-square p-1"
                  style={{ background: squareBg }}
                />
              );
            }
            return (
              <div
                key={cell.id}
                data-tile-id={cell.id}
                className="relative aspect-square min-h-0 p-1"
                style={{ background: squareBg }}
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
                  highlighted={
                    highlightIds.includes(cell.id) ||
                    guidePath.includes(cell.id)
                  }
                  clearing={clearing.includes(cell.id)}
                  rejectShake={rejectId === cell.id}
                  guidePulse={guideHead === cell.id}
                />
              </div>
            );
          }),
        )}
        <ClearFx
          positions={state.lastClearPositions ?? []}
          scoreGain={state.lastScoreGain}
          clearsCount={state.clearsCount}
        />
      </div>

      {state.lastScoreGain ? (
        <div
          key={`${state.clearsCount}-${state.lastScoreGain}`}
          className="pointer-events-none absolute left-1/2 top-1/3 z-20 -translate-x-1/2 animate-[popScore_900ms_ease-out_forwards] text-2xl font-semibold text-[#2A9D8F]"
        >
          +{state.lastScoreGain}
          {isFeverCombo(Math.max(1, state.combo - 1)) ? (
            <span className="ml-1 text-sm text-[#E9A319]">fever</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
