"use client";

import { COLOR_HEX } from "@/game/config";
import type { SymbolId, Tile as TileModel } from "@/types/game";

function SymbolGlyph({
  symbol,
  color,
  wild,
}: {
  symbol: SymbolId;
  color: string;
  wild: boolean;
}) {
  if (wild) {
    return (
      <svg viewBox="0 0 24 24" className="h-[42%] w-[42%]" aria-hidden>
        <path
          fill={color}
          d="M12 2.5l2.4 6.6h7l-5.6 4.2 2.1 6.7L12 16.8 6.1 20l2.1-6.7L2.6 9.1h7L12 2.5z"
        />
      </svg>
    );
  }
  switch (symbol) {
    case "circle":
      return (
        <svg viewBox="0 0 24 24" className="h-[40%] w-[40%]" aria-hidden>
          <circle cx="12" cy="12" r="8" fill={color} />
        </svg>
      );
    case "triangle":
      return (
        <svg viewBox="0 0 24 24" className="h-[42%] w-[42%]" aria-hidden>
          <path fill={color} d="M12 4l9 16H3L12 4z" />
        </svg>
      );
    case "square":
      return (
        <svg viewBox="0 0 24 24" className="h-[38%] w-[38%]" aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="2" fill={color} />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 24 24" className="h-[42%] w-[42%]" aria-hidden>
          <path fill={color} d="M12 3l9 9-9 9-9-9 9-9z" />
        </svg>
      );
  }
}

interface TileProps {
  tile: TileModel;
  selected: boolean;
  highlighted?: boolean;
  inPath?: boolean;
  pathHead?: boolean;
  clearing?: boolean;
  rejectShake?: boolean;
}

export function Tile({
  tile,
  selected,
  highlighted,
  inPath,
  pathHead,
  clearing,
  rejectShake,
}: TileProps) {
  const accent = COLOR_HEX[tile.color];

  return (
    <div
      aria-label={`${tile.wild ? "wild" : tile.symbol} ${tile.color}${tile.locked ? " locked" : ""}`}
      role="img"
      className={[
        "relative aspect-square w-full rounded-2xl border border-black/5 bg-[#FBFBFA]",
        "shadow-[0_2px_8px_rgba(30,40,50,0.08)]",
        "flex items-center justify-center transition-transform duration-150 ease-out",
        "touch-manipulation select-none pointer-events-none",
        selected || pathHead ? "scale-105 z-10 ring-2 ring-[#1E2A32]/25" : "",
        inPath && !pathHead ? "ring-2 ring-[#2A9D8F]/35 scale-[1.02]" : "",
        highlighted ? "ring-2 ring-[#2A9D8F]/50" : "",
        clearing ? "scale-0 opacity-0" : "",
        tile.locked ? "opacity-70" : "",
        rejectShake ? "animate-[tileShake_280ms_ease-in-out]" : "",
      ].join(" ")}
      style={{ transitionDuration: clearing ? "220ms" : "150ms" }}
    >
      {tile.locked ? (
        <span className="text-lg opacity-80" aria-hidden>
          🔒
        </span>
      ) : (
        <SymbolGlyph symbol={tile.symbol} color={accent} wild={tile.wild} />
      )}
      {tile.wild && !tile.locked && (
        <span className="absolute bottom-1 right-1.5 text-[10px] font-medium text-[#1E2A32]/40">
          ★
        </span>
      )}
    </div>
  );
}
