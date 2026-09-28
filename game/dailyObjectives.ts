import { createRng } from "@/game/rng";
import { dailySeed } from "@/game/dailyBoard";
import type { DailyObjectives, DailyProgress } from "@/types/game";

export function emptyDailyProgress(objectives: DailyObjectives): DailyProgress {
  return {
    bestLoopSize: 0,
    wildsUsed: 0,
    loopGoalMet: false,
    wildGoalMet: true, // 0 uses ≤ max until exceeded
    scoreGoalMet: false,
  };
}

/**
 * Seeded daily bonus goals — three stages, longest-path focus.
 */
export function createDailyObjectives(dateStr: string): DailyObjectives {
  const seed = dailySeed(dateStr);
  const rng = createRng(seed ^ 0x0b7ec7);
  // Complete all three stages; bonus goals lean toward longer clears
  const minLoopSize = 6;
  const maxWildUses = rng() < 0.5 ? 2 : 1;
  const targetScore = 200 + Math.floor(rng() * 4) * 40;
  return { minLoopSize, maxWildUses, targetScore };
}

export function updateDailyProgress(
  prev: DailyProgress,
  objectives: DailyObjectives,
  opts: {
    loopSize: number;
    wildsInLoop: number;
    score: number;
  },
): DailyProgress {
  const bestLoopSize = Math.max(prev.bestLoopSize, opts.loopSize);
  const wildsUsed = prev.wildsUsed + opts.wildsInLoop;
  return {
    bestLoopSize,
    wildsUsed,
    loopGoalMet: bestLoopSize >= objectives.minLoopSize,
    wildGoalMet: wildsUsed <= objectives.maxWildUses,
    scoreGoalMet: opts.score >= objectives.targetScore,
  };
}

export function countObjectivesMet(
  objectives: DailyObjectives,
  progress: DailyProgress,
): { met: number; total: number } {
  const checks = [
    progress.loopGoalMet,
    progress.wildGoalMet,
    progress.scoreGoalMet || false,
  ];
  // score goal can complete on solve even mid-game
  void objectives;
  return {
    met: checks.filter(Boolean).length,
    total: 3,
  };
}
