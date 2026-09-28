import { createInitialState, newDailyGame } from "@/game/actions";
import {
  assertDailyDeterminism,
  dailySeed,
  generateDailyBoard,
} from "@/game/dailyBoard";
import { countObjectivesMet } from "@/game/dailyObjectives";
import { DAILY_MOVE_LIMIT, GRID_SIZE } from "@/game/config";
import type {
  DailyObjectives,
  DailyProgress,
  GameState,
} from "@/types/game";

export function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function createDailyState(dateStr: string): GameState {
  return newDailyGame(dateStr);
}

export function formatDailyShare(opts: {
  dateStr: string;
  moves: number;
  limit: number;
  solved: boolean;
  score: number;
  streak: number;
  objectives: DailyObjectives | null;
  progress: DailyProgress | null;
}): string {
  const {
    dateStr,
    moves,
    limit,
    solved,
    score,
    streak,
    objectives,
    progress,
  } = opts;
  const faces = solved ? "✅" : "❌";
  const bars = Array.from({ length: limit }, (_, i) =>
    i < moves ? "■" : "□",
  ).join("");

  const lines = [
    `LINK Daily ${dateStr}`,
    `${faces} ${solved ? "Solved" : "Missed"} · ${moves}/${limit} · ${score} pts`,
    bars,
  ];

  if (objectives && progress) {
    const { met, total } = countObjectivesMet(objectives, progress);
    lines.push(
      `Goals ${met}/${total}`,
      `${progress.loopGoalMet ? "✓" : "○"} loop ≥${objectives.minLoopSize}`,
      `${progress.wildGoalMet ? "✓" : "○"} ≤${objectives.maxWildUses} wild`,
      `${progress.scoreGoalMet ? "✓" : "○"} ≥${objectives.targetScore} score`,
    );
  }

  if (streak > 0) {
    lines.push(`Streak ${streak}`);
  }

  lines.push("Create. Connect. Clear.");
  return lines.join("\n");
}

export function formatEndlessShare(
  score: number,
  loops: number,
  maxCombo = 1,
  levelLabel?: string,
): string {
  const levelBit = levelLabel ? ` · ${levelLabel}` : "";
  return `LINK${levelBit} — scored ${score} with ${loops} loops (combo ×${maxCombo}). Create. Connect. Clear.`;
}

/** Calendar strip for the last `days` days ending today. */
export function streakCalendarMarks(
  solvedDates: string[],
  days = 14,
  today = dateKey(),
): Array<{ date: string; solved: boolean }> {
  const set = new Set(solvedDates);
  const out: Array<{ date: string; solved: boolean }> = [];
  const base = new Date(today + "T12:00:00");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const key = dateKey(d);
    out.push({ date: key, solved: set.has(key) });
  }
  return out;
}

export {
  DAILY_MOVE_LIMIT,
  GRID_SIZE,
  createInitialState,
  assertDailyDeterminism,
  dailySeed,
  generateDailyBoard,
};
