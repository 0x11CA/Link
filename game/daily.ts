import { createInitialState, newDailyGame } from "@/game/actions";
import {
  assertDailyDeterminism,
  dailySeed,
  generateDailyBoard,
} from "@/game/dailyBoard";
import { DAILY_MOVE_LIMIT, GRID_SIZE } from "@/game/config";
import type { GameState } from "@/types/game";

export function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function createDailyState(dateStr: string): GameState {
  return newDailyGame(dateStr);
}

export function formatDailyShare(
  dateStr: string,
  moves: number,
  limit: number,
  solved: boolean,
): string {
  const faces = solved ? "✅" : "❌";
  const bars = Array.from({ length: limit }, (_, i) =>
    i < moves ? "■" : "□",
  ).join("");
  return [
    `LINK Daily ${dateStr}`,
    `${faces} ${solved ? "Solved" : "Missed"} in ${moves}/${limit}`,
    bars,
    "Create. Connect. Clear.",
  ].join("\n");
}

export function formatEndlessShare(score: number, loops: number): string {
  return `LINK — scored ${score} with ${loops} loops. Create. Connect. Clear.`;
}

export {
  DAILY_MOVE_LIMIT,
  GRID_SIZE,
  createInitialState,
  assertDailyDeterminism,
  dailySeed,
  generateDailyBoard,
};
