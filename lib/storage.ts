import type {
  PersistedStats,
  Settings,
  DailyResult,
  DailyStreak,
  TeachFlags,
  GameState,
  Tile,
} from "@/types/game";

const STATS_KEY = "link:stats";
const SETTINGS_KEY = "link:settings";
const TUTORIAL_KEY = "link:tutorialDone";
const DAILY_KEY = "link:daily";
const SESSION_KEY = "link:session";
const STREAK_KEY = "link:dailyStreak";
const TEACH_KEY = "link:teach";

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

export const defaultStreak = (): DailyStreak => ({
  current: 0,
  best: 0,
  lastSolvedDate: null,
  solvedDates: [],
});

export const defaultTeach = (): TeachFlags => ({
  seenWild: false,
  seenLock: false,
  seenBridge: false,
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

export function loadDailyStreak(): DailyStreak {
  const raw = read(STREAK_KEY, defaultStreak());
  return {
    ...defaultStreak(),
    ...raw,
    solvedDates: Array.isArray(raw.solvedDates) ? raw.solvedDates : [],
  };
}

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Record a solved daily and update streak. Idempotent per date. */
export function recordDailySolved(dateStr: string): DailyStreak {
  const streak = loadDailyStreak();
  if (streak.solvedDates.includes(dateStr)) return streak;

  const solvedDates = [...streak.solvedDates, dateStr].slice(-60);
  let current = 1;
  if (streak.lastSolvedDate === dayBefore(dateStr)) {
    current = streak.current + 1;
  } else if (streak.lastSolvedDate === dateStr) {
    current = streak.current;
  }

  const next: DailyStreak = {
    current,
    best: Math.max(streak.best, current),
    lastSolvedDate: dateStr,
    solvedDates,
  };
  write(STREAK_KEY, next);
  return next;
}

export function loadTeachFlags(): TeachFlags {
  return read(TEACH_KEY, defaultTeach());
}

export function saveTeachFlags(flags: TeachFlags): void {
  write(TEACH_KEY, flags);
}

function migrateTile(t: Tile): Tile {
  return {
    ...t,
    bridge: t.bridge ?? false,
    connections: [...(t.connections ?? [])],
  };
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
    parsed.board = parsed.board.map((row) =>
      row.map((cell) => (cell ? migrateTile(cell) : null)),
    );
    if (parsed.dailyObjectives === undefined) parsed.dailyObjectives = null;
    if (parsed.dailyProgress === undefined) parsed.dailyProgress = null;
    if (parsed.difficultyLevel === undefined) {
      parsed.difficultyLevel = parsed.mode === "endless" ? "medium" : null;
    }
    if (!Array.isArray(parsed.lastClearPositions)) {
      parsed.lastClearPositions = [];
    }
    if (typeof parsed.undosLeft !== "number") parsed.undosLeft = 3;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
