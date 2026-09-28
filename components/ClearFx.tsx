"use client";

import { useEffect, useState } from "react";
import { COLOR_HEX, GRID_SIZE } from "@/game/config";
import type { ColorId, TileId } from "@/types/game";

type Particle = {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
};

/**
 * Burst particles + per-tile floaters at last clear positions.
 */
export function ClearFx({
  positions,
  scoreGain,
  clearsCount,
}: {
  positions: Array<{
    id: TileId;
    row: number;
    col: number;
    color: ColorId;
  }>;
  scoreGain: number | null;
  clearsCount: number;
}) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floaters, setFloaters] = useState<
    Array<{ id: string; x: number; y: number; label: string }>
  >([]);

  useEffect(() => {
    if (!positions.length || !scoreGain) return;
    const nextParticles: Particle[] = [];
    const nextFloaters: Array<{
      id: string;
      x: number;
      y: number;
      label: string;
    }> = [];
    const perTile = Math.max(1, Math.round(scoreGain / positions.length));

    positions.forEach((pos, idx) => {
      const x = ((pos.col + 0.5) / GRID_SIZE) * 100;
      const y = ((pos.row + 0.5) / GRID_SIZE) * 100;
      const color = COLOR_HEX[pos.color];
      for (let p = 0; p < 5; p++) {
        const angle = (Math.PI * 2 * p) / 5 + idx * 0.3;
        nextParticles.push({
          id: `${clearsCount}-${pos.id}-${p}`,
          x,
          y,
          dx: Math.cos(angle) * (8 + (p % 3) * 4),
          dy: Math.sin(angle) * (8 + (p % 3) * 4) - 4,
          color,
        });
      }
      nextFloaters.push({
        id: `f-${clearsCount}-${pos.id}`,
        x,
        y,
        label: `+${perTile}`,
      });
    });

    setParticles(nextParticles);
    setFloaters(nextFloaters);
    const t = window.setTimeout(() => {
      setParticles([]);
      setFloaters([]);
    }, 750);
    return () => window.clearTimeout(t);
  }, [positions, scoreGain, clearsCount]);

  if (!particles.length && !floaters.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[1.25rem]">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[clearParticle_700ms_ease-out_forwards]"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              background: p.color,
              ["--dx" as string]: `${p.dx}px`,
              ["--dy" as string]: `${p.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
      {floaters.map((f) => (
        <span
          key={f.id}
          className="absolute -translate-x-1/2 animate-[floatScore_700ms_ease-out_forwards] text-xs font-semibold text-[#2A9D8F]"
          style={{ left: `${f.x}%`, top: `${f.y}%` }}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}
