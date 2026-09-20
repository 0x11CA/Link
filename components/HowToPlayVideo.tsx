"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const SIZE = 5;

type SymbolKind = "circle" | "triangle" | "square" | "diamond";

type TileDef = {
  symbol: SymbolKind;
  color: string;
};

type Scene = {
  caption: string;
  selected: number[];
  edges: Array<[number, number]>;
  glowIds: number[];
  clearIds: number[];
  score?: boolean;
};

const PALETTE = ["#E85D4C", "#2A9D8F", "#4A6FA5", "#E9A319"] as const;

/** Center 2×2 used for the demo loop (row-major indices on 5×5). */
const LOOP = {
  tl: 1 * SIZE + 1, // (1,1)
  tr: 1 * SIZE + 2, // (1,2)
  br: 2 * SIZE + 2, // (2,2)
  bl: 2 * SIZE + 1, // (2,1)
} as const;

const LOOP_IDS = [LOOP.tl, LOOP.tr, LOOP.br, LOOP.bl];

function buildBoard(): TileDef[] {
  const board: TileDef[] = [];
  const symbols: SymbolKind[] = ["circle", "triangle", "square", "diamond"];
  for (let i = 0; i < SIZE * SIZE; i++) {
    board.push({
      symbol: symbols[i % 4]!,
      color: PALETTE[i % 4]!,
    });
  }
  // Force a clearable 2×2 in the center (same symbol/color edges)
  board[LOOP.tl] = { symbol: "circle", color: PALETTE[0] };
  board[LOOP.tr] = { symbol: "circle", color: PALETTE[1] };
  board[LOOP.br] = { symbol: "square", color: PALETTE[1] };
  board[LOOP.bl] = { symbol: "square", color: PALETTE[0] };
  return board;
}

const BOARD = buildBoard();

const SCENES: Scene[] = [
  {
    caption: "This is your 5 × 5 board.",
    selected: [],
    edges: [],
    glowIds: [],
    clearIds: [],
  },
  {
    caption: "Tap a tile…",
    selected: [LOOP.tl],
    edges: [],
    glowIds: [],
    clearIds: [],
  },
  {
    caption: "…then a match — same symbol or color.",
    selected: [LOOP.tl, LOOP.tr],
    edges: [],
    glowIds: [],
    clearIds: [],
  },
  {
    caption: "A link appears.",
    selected: [],
    edges: [[LOOP.tl, LOOP.tr]],
    glowIds: [],
    clearIds: [],
  },
  {
    caption: "Each tile can have only 2 links.",
    selected: [LOOP.tr],
    edges: [[LOOP.tl, LOOP.tr]],
    glowIds: [],
    clearIds: [],
  },
  {
    caption: "Keep connecting…",
    selected: [],
    edges: [
      [LOOP.tl, LOOP.tr],
      [LOOP.tr, LOOP.br],
    ],
    glowIds: [],
    clearIds: [],
  },
  {
    caption: "…and close the loop.",
    selected: [],
    edges: [
      [LOOP.tl, LOOP.tr],
      [LOOP.tr, LOOP.br],
      [LOOP.br, LOOP.bl],
    ],
    glowIds: [],
    clearIds: [],
  },
  {
    caption: "Loop complete!",
    selected: [],
    edges: [
      [LOOP.tl, LOOP.tr],
      [LOOP.tr, LOOP.br],
      [LOOP.br, LOOP.bl],
      [LOOP.bl, LOOP.tl],
    ],
    glowIds: LOOP_IDS,
    clearIds: [],
  },
  {
    caption: "Tiles clear. You score.",
    selected: [],
    edges: [],
    glowIds: [],
    clearIds: LOOP_IDS,
    score: true,
  },
  {
    caption: "New tiles fall in. Keep going.",
    selected: [],
    edges: [],
    glowIds: [],
    clearIds: [],
  },
];

const SCENE_MS = 1400;

function Glyph({ kind, color }: { kind: SymbolKind; color: string }) {
  const cls = "h-[55%] w-[55%]";
  switch (kind) {
    case "circle":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden>
          <circle cx="12" cy="12" r="8" fill={color} />
        </svg>
      );
    case "triangle":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden>
          <path fill={color} d="M12 4l9 16H3L12 4z" />
        </svg>
      );
    case "square":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="2" fill={color} />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden>
          <path fill={color} d="M12 3l9 9-9 9-9-9 9-9z" />
        </svg>
      );
  }
}

function cellCenter(index: number): { x: number; y: number } {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const cell = 100 / SIZE;
  return { x: (col + 0.5) * cell, y: (row + 0.5) * cell };
}

export function HowToPlayVideo() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  const scene = SCENES[index]!;
  const progress = ((index + 1) / SCENES.length) * 100;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % SCENES.length);
    }, SCENE_MS);
    return () => clearTimeout(t);
  }, [index, playing]);

  const replay = useCallback(() => {
    setIndex(0);
    setPlaying(true);
  }, []);

  const clearSet = useMemo(() => new Set(scene.clearIds), [scene.clearIds]);
  const glowSet = useMemo(() => new Set(scene.glowIds), [scene.glowIds]);

  return (
    <div className="overflow-hidden rounded-3xl bg-[#1E2A32] shadow-[0_16px_40px_rgba(30,42,50,0.18)]">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-[11px] font-medium tracking-wide text-white/50">
          HOW TO PLAY
        </span>
        <span className="text-[11px] tabular-nums text-white/35">
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(SCENES.length).padStart(2, "0")}
        </span>
      </div>

      <div className="relative mx-4 mb-3 aspect-square overflow-hidden rounded-2xl bg-[#E8E4DE]">
        <div
          className="absolute inset-0 grid gap-1.5 p-2.5 sm:gap-2 sm:p-3"
          style={{
            gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`,
          }}
        >
          {BOARD.map((tile, i) => {
            const clearing = clearSet.has(i);
            const selected = scene.selected.includes(i);
            const glowing = glowSet.has(i);
            const inFocus =
              scene.selected.length === 0 &&
              scene.edges.length === 0 &&
              scene.glowIds.length === 0 &&
              scene.clearIds.length === 0
                ? true
                : LOOP_IDS.includes(i) ||
                  scene.selected.includes(i) ||
                  scene.edges.some(([a, b]) => a === i || b === i);

            return (
              <div
                key={i}
                className={[
                  "flex aspect-square items-center justify-center rounded-xl bg-[#FBFBFA]",
                  "shadow-[0_1px_4px_rgba(30,40,50,0.08)] transition-all duration-300",
                  clearing ? "scale-0 opacity-0" : "scale-100 opacity-100",
                  selected ? "z-10 scale-105 ring-2 ring-[#1E2A32]/30" : "",
                  glowing ? "ring-2 ring-[#2A9D8F]/70" : "",
                  !inFocus && !clearing ? "opacity-40" : "",
                ].join(" ")}
              >
                <Glyph kind={tile.symbol} color={tile.color} />
              </div>
            );
          })}
        </div>

        <svg
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {scene.edges.map(([a, b]) => {
            const pa = cellCenter(a);
            const pb = cellCenter(b);
            const glow = glowSet.has(a) && glowSet.has(b);
            return (
              <line
                key={`${a}-${b}-${index}`}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={glow ? "#2A9D8F" : "#1E2A32"}
                strokeOpacity={glow ? 0.9 : 0.45}
                strokeWidth={1.6}
                strokeLinecap="round"
                className="animate-[drawLine_280ms_ease-out]"
              />
            );
          })}
        </svg>

        {scene.score && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <span className="animate-[popScore_900ms_ease-out_forwards] text-3xl font-semibold text-[#2A9D8F]">
              +60
            </span>
          </div>
        )}
      </div>

      <p
        key={index}
        className="min-h-[3rem] px-5 pb-3 text-center text-[15px] font-medium leading-snug text-white/90 animate-[fadeCaption_280ms_ease-out]"
      >
        {scene.caption}
      </p>

      <div className="px-4 pb-4">
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#2A9D8F] transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/15"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={replay}
            className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/15"
          >
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}
