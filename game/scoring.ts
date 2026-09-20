import { SCORING } from "@/game/config";

export function baseScoreForLoop(size: number): number {
  if (SCORING.baseBySize[size] !== undefined) {
    return SCORING.baseBySize[size]!;
  }
  if (size >= SCORING.largeThreshold) {
    return (
      SCORING.largeBase +
      SCORING.largeExtraPerTile * (size - SCORING.largeThreshold)
    );
  }
  // Even sizes between table entries (e.g. unexpected) — interpolate softly
  if (size > 8 && size < SCORING.largeThreshold) {
    return 200 + 25 * (size - 8);
  }
  // Reject odd / too-small in v1 by returning 0 (caller shouldn't clear)
  if (size < 4) return 0;
  return Math.max(30, size * 15);
}

export function scoreLoop(size: number, combo: number): number {
  const base = baseScoreForLoop(size);
  const mult = Math.max(1, combo);
  return base * mult;
}
