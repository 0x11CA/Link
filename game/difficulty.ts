import { stageFromClears } from "@/game/board";
import { DIFFICULTY_STAGES } from "@/game/config";

export function nextDifficultyStage(clearsCount: number): number {
  return stageFromClears(clearsCount);
}

export function difficultyLabel(stage: number): string {
  const cfg =
    DIFFICULTY_STAGES[Math.min(stage, DIFFICULTY_STAGES.length - 1)]!;
  return `${cfg.symbols} symbols · ${cfg.colors} colors`;
}
