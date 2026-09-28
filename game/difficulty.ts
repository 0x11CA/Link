import { stageFromClears } from "@/game/board";
import { DIFFICULTY_STAGES, LEVEL_PRESETS } from "@/game/config";
import type { DifficultyLevel } from "@/types/game";

export function levelPreset(level: DifficultyLevel) {
  return LEVEL_PRESETS[level];
}

/**
 * Stage for endless runs: start at the level’s floor, climb with clears,
 * never past the level’s max.
 */
export function nextDifficultyStage(
  clearsCount: number,
  level: DifficultyLevel | null = "medium",
): number {
  if (!level) {
    return stageFromClears(clearsCount);
  }
  const { startStage, maxStage } = LEVEL_PRESETS[level];
  const climbed = startStage + stageFromClears(clearsCount);
  return Math.min(maxStage, climbed);
}

export function difficultyLabel(stage: number): string {
  const cfg =
    DIFFICULTY_STAGES[Math.min(stage, DIFFICULTY_STAGES.length - 1)]!;
  return `${cfg.symbols} symbols · ${cfg.colors} colors`;
}

export function levelDisplayName(level: DifficultyLevel | null): string {
  if (!level) return "Daily";
  return LEVEL_PRESETS[level].label;
}
