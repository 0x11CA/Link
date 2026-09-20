import type { PersistedStats, Settings, DailyResult, GameState } from "@/types/game";

const STATS_KEY = "link:stats";
const SETTINGS_KEY = "link:settings";
const TUTORIAL_KEY = "link:tutorialDone";
const DAILY_KEY = "link:daily";
const SESSION_KEY = "link:session";

export const defaultStats = (): PersistedStats => ({
  gamesPlayed: 0,
  bestScore: 0,
  totalScore: 0,
  totalLoops: 0,
  largestLoop: 0,
  bestCombo: 0,
  totalConnections: 0,
});

export const defaultSettings = (): Settings => ({
  sound: true,
  haptics: true,
});

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadStats(): PersistedStats {
  return read(STATS_KEY, defaultStats());
}

export function saveStats(stats: PersistedStats): void {
  write(STATS_KEY, stats);
}

/** Update best score immediately if the current score is higher. */
export function recordBestScore(score: number): number {
  const stats = loadStats();
  if (score > stats.bestScore) {
    stats.bestScore = score;
    saveStats(stats);
  }
  return stats.bestScore;
}

export function loadSettings(): Settings {
  return read(SETTINGS_KEY, defaultSettings());
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function isTutorialDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(TUTORIAL_KEY) === "1";
}

export function setTutorialDone(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TUTORIAL_KEY, "1");
}

export function loadDailyResult(date: string): DailyResult | null {
  const all = read<Record<string, DailyResult>>(DAILY_KEY, {});
  return all[date] ?? null;
}

export function saveDailyResult(result: DailyResult): void {
  const all = read<Record<string, DailyResult>>(DAILY_KEY, {});
  all[result.date] = result;
  write(DAILY_KEY, all);
}

export function saveSession(state: GameState): void {
  if (typeof window === "undefined") return;
  if (state.mode !== "endless") return;
  if (state.gameOver) {
    clearSession();
    return;
  }
  write(SESSION_KEY, state);
}

export function loadSession(): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed?.board || parsed.mode !== "endless" || parsed.gameOver) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
