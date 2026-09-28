"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { HowToPlayVideo } from "@/components/HowToPlayVideo";
import { Board } from "@/components/Board";
import { ComboMeter } from "@/components/ComboMeter";
import {
  GhostButton,
  IconButton,
  Modal,
  PrimaryButton,
  Shell,
} from "@/components/ui";
import {
  createInitialState,
  newDailyGame,
  newEndlessGame,
  reduce,
} from "@/game/actions";
import {
  dateKey,
  formatDailyShare,
  formatEndlessShare,
  streakCalendarMarks,
} from "@/game/daily";
import { countObjectivesMet } from "@/game/dailyObjectives";
import { suggestHint } from "@/game/hints";
import {
  FAILED_TRIES_BEFORE_HELP,
  FREE_HINT_EVERY_CLEARS,
  MAX_HINTS,
  MIN_LOOP_SIZE,
  STARTING_HINTS,
  DIFFICULTY_STAGES,
} from "@/game/config";
import { isFeverCombo } from "@/game/scoring";
import type { DailyStreak, GameAction, GameState, TeachFlags } from "@/types/game";
import { playSfx } from "@/lib/audio";
import { haptic } from "@/lib/haptics";
import { shareText } from "@/lib/share";
import {
  clearSession,
  isTutorialDone,
  loadDailyStreak,
  loadSession,
  loadSettings,
  loadStats,
  loadTeachFlags,
  recordBestScore,
  recordDailySolved,
  saveDailyResult,
  saveSession,
  saveSettings,
  saveStats,
  saveTeachFlags,
  setTutorialDone,
} from "@/lib/storage";
import { createMathChallenge } from "@/lib/mathChallenge";
import { validateConnection } from "@/game/connections";
import type { Settings } from "@/types/game";

type View =
  | "home"
  | "play"
  | "daily"
  | "tutorial"
  | "how"
  | "stats"
  | "settings";

function gameReducer(state: GameState, action: GameAction | { type: "REPLACE"; state: GameState }): GameState {
  if (action.type === "REPLACE") return action.state;
  return reduce(state, action);
}

function buildTutorialState(): GameState {
  // Craft a tiny guided board with an obvious 2x2 loop in the center
  const base = createInitialState({ mode: "endless", seed: 1 });
  const board = base.board.map((row) =>
    row.map((t) =>
      t
        ? {
            ...t,
            connections: [] as string[],
            locked: false,
            wild: false,
            bridge: false,
          }
        : null,
    ),
  );
  // Force a clear 2x2 matching square at bottom-left for tutorial
  const cells = [
    { r: 3, c: 0, symbol: "circle" as const, color: "coral" as const },
    { r: 3, c: 1, symbol: "circle" as const, color: "teal" as const },
    { r: 4, c: 1, symbol: "square" as const, color: "teal" as const },
    { r: 4, c: 0, symbol: "square" as const, color: "coral" as const },
  ];
  for (const cell of cells) {
    const t = board[cell.r]![cell.c]!;
    board[cell.r]![cell.c] = {
      ...t,
      symbol: cell.symbol,
      color: cell.color,
      locked: false,
      wild: false,
      bridge: false,
      connections: [],
    };
  }
  return { ...base, board, undosLeft: 1 };
}

export function GameApp() {
  const [view, setView] = useState<View>("home");
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    newEndlessGame(),
  );
  const [settings, setSettingsState] = useState<Settings>({
    sound: true,
    haptics: true,
  });
  const [best, setBest] = useState(() =>
    typeof window !== "undefined" ? loadStats().bestScore : 0,
  );
  const [stats, setStats] = useState(() => loadStats());
  const [hasSession, setHasSession] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [hintIds, setHintIds] = useState<string[]>([]);
  const [hintEdges, setHintEdges] = useState<Array<{ a: string; b: string }>>(
    [],
  );
  const [hintScore, setHintScore] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(STARTING_HINTS);
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [guidePath, setGuidePath] = useState<string[]>([]);
  const [guideActive, setGuideActive] = useState(false);
  const [guideWillComplete, setGuideWillComplete] = useState(false);
  const [freeHintFlash, setFreeHintFlash] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);
  const [mathChallenge, setMathChallenge] = useState<{
    prompt: string;
    answer: number;
  } | null>(null);
  const [mathInput, setMathInput] = useState("");
  const [mathError, setMathError] = useState(false);
  const [comboBroken, setComboBroken] = useState(false);
  const [stageToast, setStageToast] = useState<string | null>(null);
  const [teachToast, setTeachToast] = useState<string | null>(null);
  const [streak, setStreak] = useState<DailyStreak>(() =>
    typeof window !== "undefined" ? loadDailyStreak() : {
      current: 0,
      best: 0,
      lastSolvedDate: null,
      solvedDates: [],
    },
  );
  const [teach, setTeach] = useState<TeachFlags>(() =>
    typeof window !== "undefined"
      ? loadTeachFlags()
      : { seenWild: false, seenLock: false, seenBridge: false },
  );
  const pendingGuideRef = useRef<{
    tileIds: string[];
    edges: Array<{ a: string; b: string }>;
    potentialScore: number;
  } | null>(null);
  const prevComboRef = useRef(1);
  const prevStageRef = useRef(0);
  const pathStepsRef = useRef(0);
  const pathIdsRef = useRef<string[]>([]);
  const stateRef = useRef(state);
  const recordedGameOver = useRef(false);
  const guideTimerRef = useRef<number | null>(null);
  const failedTriesRef = useRef(0);
  const helpOfferedThisStreak = useRef(false);
  const lastClearsForFreeHint = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    pathIdsRef.current = pathIds;
  }, [pathIds]);

  const bumpActivity = useCallback(() => {
    // Reserved for activity tracking hooks
  }, []);

  useEffect(() => {
    return () => {
      if (guideTimerRef.current) window.clearInterval(guideTimerRef.current);
    };
  }, []);


  useEffect(() => {
    setSettingsState(loadSettings());
    const s = loadStats();
    setBest(s.bestScore);
    setStats(s);
    setHasSession(!!loadSession());
  }, []);

  // Persist best score live as it improves
  useEffect(() => {
    if (state.mode !== "endless") return;
    if (state.score <= 0) return;
    const nextBest = recordBestScore(state.score);
    if (nextBest !== best) setBest(nextBest);
  }, [state.score, state.mode, best]);

  // Persist in-progress endless session
  useEffect(() => {
    if (view !== "play" && view !== "tutorial") return;
    if (state.mode !== "endless") return;
    saveSession(state);
    setHasSession(!state.gameOver);
  }, [state, view]);

  useEffect(() => {
    const canRecover =
      state.mode === "endless" &&
      state.gameOver &&
      state.recoveryUndosLeft > 0 &&
      state.preClearSnapshot != null;
    // Only record stats on final game over (no recovery left / declined)
    if (
      state.gameOver &&
      state.mode === "endless" &&
      !canRecover &&
      !recordedGameOver.current
    ) {
      recordedGameOver.current = true;
      playSfx("gameover", settings.sound);
      haptic(settings.haptics, [30, 40, 30]);
      const s = loadStats();
      s.gamesPlayed += 1;
      s.totalScore += state.score;
      s.bestScore = Math.max(s.bestScore, state.score);
      s.totalLoops += state.stats.loopsCreated;
      s.largestLoop = Math.max(s.largestLoop, state.stats.largestLoop);
      s.bestCombo = Math.max(s.bestCombo, state.stats.longestCombo);
      s.totalConnections += state.stats.totalConnections;
      saveStats(s);
      setBest(s.bestScore);
      setStats(s);
      clearSession();
    }
    if (!state.gameOver) recordedGameOver.current = false;
  }, [
    state.gameOver,
    state.mode,
    state.score,
    state.stats,
    state.recoveryUndosLeft,
    state.preClearSnapshot,
    settings.sound,
    settings.haptics,
  ]);

  useEffect(() => {
    if (state.dailySolved && state.mode === "daily") {
      const objectives = state.dailyObjectives;
      const progress = state.dailyProgress;
      let objectivesMet = 0;
      let objectivesTotal = 3;
      if (objectives && progress) {
        const scored = {
          ...progress,
          scoreGoalMet:
            progress.scoreGoalMet || state.score >= objectives.targetScore,
        };
        const c = countObjectivesMet(objectives, scored);
        objectivesMet = c.met;
        objectivesTotal = c.total;
      }
      saveDailyResult({
        date: dateKey(),
        solved: true,
        moves: state.moveCount,
        limit: state.dailyMoveLimit,
        score: state.score,
        objectivesMet,
        objectivesTotal,
      });
      setStreak(recordDailySolved(dateKey()));
    }
  }, [
    state.dailySolved,
    state.mode,
    state.moveCount,
    state.dailyMoveLimit,
    state.score,
    state.dailyObjectives,
    state.dailyProgress,
  ]);

  useEffect(() => {
    if (state.lastClearSize) {
      if (isFeverCombo(Math.max(1, state.combo - 1))) {
        playSfx("fever", settings.sound);
      } else if (state.combo > 2) {
        playSfx("combo", settings.sound);
      } else {
        playSfx("loop", settings.sound);
      }
      haptic(settings.haptics, [10, 20, 10]);

      // Successful clear — reset failed-try streak
      failedTriesRef.current = 0;
      helpOfferedThisStreak.current = false;

      // Every 5 clears → free hint
      const clears = state.clearsCount;
      const prevMilestone = lastClearsForFreeHint.current;
      if (
        clears > 0 &&
        clears % FREE_HINT_EVERY_CLEARS === 0 &&
        clears !== prevMilestone
      ) {
        lastClearsForFreeHint.current = clears;
        setHintsLeft((n) => Math.min(MAX_HINTS, n + 1));
        setFreeHintFlash(true);
        window.setTimeout(() => setFreeHintFlash(false), 1600);
        playSfx("combo", settings.sound);
      }
    }
  }, [state.lastClearSize, state.clearsCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Combo break sting when a non-clear connect drops an active combo
  useEffect(() => {
    if (
      state.lastClearSize == null &&
      state.combo === 1 &&
      prevComboRef.current > 1 &&
      state.moveCount > 0
    ) {
      setComboBroken(true);
      playSfx("comboBreak", settings.sound);
      haptic(settings.haptics, 20);
      window.setTimeout(() => setComboBroken(false), 600);
    }
    prevComboRef.current = state.combo;
  }, [state.combo, state.lastClearSize, state.moveCount, settings]);

  // Stage-up toast
  useEffect(() => {
    if (state.difficultyStage > prevStageRef.current && view === "play") {
      const cfg = DIFFICULTY_STAGES[
        Math.min(state.difficultyStage, DIFFICULTY_STAGES.length - 1)
      ]!;
      setStageToast(
        `Stage ${state.difficultyStage + 1} · ${cfg.symbols}×${cfg.colors} palette`,
      );
      window.setTimeout(() => setStageToast(null), 1800);
    }
    prevStageRef.current = state.difficultyStage;
  }, [state.difficultyStage, view]);

  // First-time specials teach moments
  useEffect(() => {
    if (view !== "play" && view !== "daily") return;
    const tiles = state.board.flat().filter(Boolean);
    setTeach((flags) => {
      let next = flags;
      let msg: string | null = null;
      if (!flags.seenWild && tiles.some((t) => t!.wild)) {
        next = { ...flags, seenWild: true };
        msg = "★ Wild tiles match any symbol or color.";
      } else if (!flags.seenLock && tiles.some((t) => t!.locked)) {
        next = { ...flags, seenLock: true };
        msg = "🔒 Locks open when you clear a loop beside them.";
      } else if (!flags.seenBridge && tiles.some((t) => t!.bridge)) {
        next = { ...flags, seenBridge: true };
        msg = "↗ Bridge tiles can connect diagonally.";
      }
      if (msg && next !== flags) {
        saveTeachFlags(next);
        setTeachToast(msg);
        window.setTimeout(() => setTeachToast(null), 3200);
        return next;
      }
      return flags;
    });
  }, [state.board, view]);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const clearPathUi = useCallback(() => {
    setPathIds([]);
    pathIdsRef.current = [];
    pathStepsRef.current = 0;
    setDrawing(false);
    setRejectId(null);
  }, []);

  const startEndless = () => {
    setHintIds([]);
    setHintEdges([]);
    setHintsLeft(STARTING_HINTS);
    failedTriesRef.current = 0;
    helpOfferedThisStreak.current = false;
    lastClearsForFreeHint.current = 0;
    clearPathUi();
    if (!isTutorialDone()) {
      dispatch({ type: "REPLACE", state: buildTutorialState() });
      setTutorialStep(1);
      setView("tutorial");
      return;
    }
    const saved = loadSession();
    if (saved && !saved.gameOver && saved.score >= 0) {
      dispatch({ type: "REPLACE", state: saved });
    } else {
      dispatch({ type: "REPLACE", state: newEndlessGame() });
    }
    setView("play");
  };

  const startDaily = () => {
    setHintIds([]);
    setHintEdges([]);
    setHintsLeft(STARTING_HINTS);
    failedTriesRef.current = 0;
    helpOfferedThisStreak.current = false;
    lastClearsForFreeHint.current = 0;
    clearPathUi();
    dispatch({ type: "REPLACE", state: newDailyGame(dateKey()) });
    setView("daily");
  };

  const pulseReject = useCallback(
    (tileId: string) => {
      setRejectId(tileId);
      playSfx("reject", settings.sound);
      haptic(settings.haptics, 28);
      window.setTimeout(() => setRejectId(null), 280);
    },
    [settings],
  );

  const cancelPath = useCallback(() => {
    const steps = pathStepsRef.current;
    let s = stateRef.current;
    for (let i = 0; i < steps; i++) {
      s = reduce(s, { type: "REVERT" });
    }
    stateRef.current = s;
    dispatch({ type: "REPLACE", state: s });
    clearPathUi();
    playSfx("select", settings.sound);
  }, [clearPathUi, settings.sound]);

  const applyHintLoop = useCallback(
    (tileIds: string[]) => {
      // Cancel any in-progress drag path first
      const steps = pathStepsRef.current;
      let s = stateRef.current;
      for (let i = 0; i < steps; i++) {
        s = reduce(s, { type: "REVERT" });
      }
      pathStepsRef.current = 0;
      pathIdsRef.current = [];
      setPathIds([]);
      setDrawing(false);

      const n = tileIds.length;
      for (let i = 0; i < n; i++) {
        const a = tileIds[i]!;
        const b = tileIds[(i + 1) % n]!;
        const v = validateConnection(s, a, b);
        if (!v.ok) continue;
        s = reduce(s, { type: "CONNECT", fromId: a, toId: b });
      }
      stateRef.current = s;
      dispatch({ type: "REPLACE", state: s });
      setHintIds([]);
      setHintEdges([]);
      setHintScore(0);
      setGuidePath([]);
      setGuideActive(false);
      setGuideWillComplete(false);
    },
    [],
  );

  const playSolutionGuide = useCallback(
    (
      tileIds: string[],
      edges: Array<{ a: string; b: string }>,
      options?: { stopAt?: number; complete?: boolean },
    ) => {
      if (guideTimerRef.current) {
        window.clearInterval(guideTimerRef.current);
        guideTimerRef.current = null;
      }
      const stopAt = options?.stopAt ?? tileIds.length;
      const shouldComplete = Boolean(options?.complete) && stopAt >= tileIds.length;
      const shownIds = tileIds.slice(0, stopAt);
      const shownEdges =
        stopAt < tileIds.length
          ? shownIds.slice(0, -1).map((a, i) => ({
              a,
              b: shownIds[i + 1]!,
            }))
          : edges;

      setGuideActive(true);
      setGuideWillComplete(shouldComplete);
      setGuidePath([]);
      setHintIds(shownIds);
      setHintEdges(shownEdges);
      let i = 0;
      guideTimerRef.current = window.setInterval(() => {
        i += 1;
        setGuidePath(shownIds.slice(0, i));
        playSfx("select", settings.sound);
        if (i >= shownIds.length) {
          if (guideTimerRef.current) {
            window.clearInterval(guideTimerRef.current);
            guideTimerRef.current = null;
          }
          window.setTimeout(() => {
            if (shouldComplete) {
              applyHintLoop(tileIds);
              bumpActivity();
            } else {
              setGuideActive(false);
              setGuideWillComplete(false);
              setGuidePath([]);
              setHintIds([]);
              setHintEdges([]);
              setHintScore(0);
              bumpActivity();
            }
          }, shouldComplete ? 280 : stopAt < tileIds.length ? 500 : 700);
        }
      }, 260);
    },
    [settings.sound, bumpActivity, applyHintLoop],
  );


  /** Soft nudge when stuck — reveal only the first half of a route (free). */
  const showHalfPathHint = useCallback(
    (tileIds: string[], edges: Array<{ a: string; b: string }>) => {
      const half = Math.max(2, Math.ceil(tileIds.length / 2));
      setHintScore(0);
      playSolutionGuide(tileIds, edges, { stopAt: half });
      haptic(settings.haptics, 8);
    },
    [playSolutionGuide, settings.haptics],
  );

  const onPathStart = useCallback(
    (tileId: string) => {
      bumpActivity();
      const s = stateRef.current;
      if (s.gameOver || s.dailySolved) return;
      const tile = s.board.flat().find((t) => t?.id === tileId);
      if (!tile || tile.locked) {
        pulseReject(tileId);
        return;
      }
      pathStepsRef.current = 0;
      pathIdsRef.current = [tileId];
      setPathIds([tileId]);
      setDrawing(true);
      setHintIds([]);
      setHintEdges([]);
      setHintScore(0);
      // Drop any leftover clear FX from a previous loop
      if (stateRef.current.lastScoreGain || stateRef.current.lastClearSize) {
        const cleared = {
          ...stateRef.current,
          lastClearSize: null,
          lastScoreGain: null,
          lastClearedIds: [],
          lastClearPositions: [],
        };
        stateRef.current = cleared;
        dispatch({ type: "REPLACE", state: cleared });
      }
      playSfx("select", settings.sound);
      haptic(settings.haptics, 8);
    },
    [pulseReject, settings, bumpActivity],
  );

  const onPathMove = useCallback(
    (tileId: string) => {
      bumpActivity();
      let s = stateRef.current;
      if (s.gameOver || s.dailySolved) return;
      const path = pathIdsRef.current;
      if (path.length === 0) return;
      const head = path[path.length - 1]!;
      if (tileId === head) return;

      // Backtrack one step
      if (path.length >= 2 && path[path.length - 2] === tileId) {
        s = reduce(s, { type: "REVERT" });
        stateRef.current = s;
        dispatch({ type: "REPLACE", state: s });
        pathStepsRef.current = Math.max(0, pathStepsRef.current - 1);
        const nextPath = path.slice(0, -1);
        pathIdsRef.current = nextPath;
        setPathIds(nextPath);
        playSfx("select", settings.sound);
        return;
      }

      const pathStart = path[0]!;
      // Close only by returning to the path start once the loop is long enough,
      // approaching from the other side (not mid-path shortcuts).
      if (tileId === pathStart) {
        if (path.length < MIN_LOOP_SIZE) {
          pulseReject(tileId);
          return;
        }
      } else if (path.includes(tileId)) {
        pulseReject(tileId);
        return;
      }

      const v = validateConnection(s, head, tileId);
      if (!v.ok) {
        pulseReject(tileId);
        return;
      }

      playSfx("connect", settings.sound);
      haptic(settings.haptics, 12);
      s = reduce(s, { type: "CONNECT", fromId: head, toId: tileId });
      stateRef.current = s;
      dispatch({ type: "REPLACE", state: s });
      pathStepsRef.current += 1;

      if (s.lastClearSize) {
        // Loop completed — celebrate and reset path
        failedTriesRef.current = 0;
        helpOfferedThisStreak.current = false;
        clearPathUi();
        if (view === "tutorial") {
          setTutorialStep((step) => Math.min(step + 1, 4));
        }
        return;
      }

      const nextPath = [...path, tileId];
      pathIdsRef.current = nextPath;
      setPathIds(nextPath);
      if (view === "tutorial") {
        setTutorialStep((step) => Math.min(step + 1, 4));
      }
    },
    [pulseReject, settings, view, clearPathUi, bumpActivity, guideActive],
  );

  const onPathEnd = useCallback(() => {
    bumpActivity();
    setDrawing(false);
    // Don't leave a partial path on the board — only closed loops stick
    if (pathStepsRef.current > 0) {
      failedTriesRef.current += 1;
      cancelPath();
      if (
        !helpOfferedThisStreak.current &&
        !guideActive &&
        view !== "tutorial" &&
        failedTriesRef.current >= FAILED_TRIES_BEFORE_HELP
      ) {
        helpOfferedThisStreak.current = true;
        const suggestion = suggestHint(stateRef.current);
        if (suggestion) {
          showHalfPathHint(suggestion.tileIds, suggestion.edges);
        }
      }
    } else {
      clearPathUi();
    }
  }, [
    bumpActivity,
    cancelPath,
    clearPathUi,
    guideActive,
    view,
    showHalfPathHint,
  ]);

  const useHint = useCallback(() => {
    bumpActivity();
    if (state.gameOver || state.dailySolved || mathOpen || guideActive) return;

    const suggestion = suggestHint(stateRef.current);
    if (!suggestion) {
      playSfx("reject", settings.sound);
      return;
    }

    setHintScore(suggestion.potentialScore);

    if (hintsLeft <= 0) {
      // Out of hints — earn a full guide with a math puzzle (no deduction)
      pendingGuideRef.current = {
        tileIds: suggestion.tileIds,
        edges: suggestion.edges,
        potentialScore: suggestion.potentialScore,
      };
      setMathChallenge(createMathChallenge());
      setMathInput("");
      setMathError(false);
      setMathOpen(true);
      playSfx("select", settings.sound);
      return;
    }

    setHintsLeft((n) => n - 1);
    playSfx("select", settings.sound);
    haptic(settings.haptics, 10);
    playSolutionGuide(suggestion.tileIds, suggestion.edges, { complete: true });
  }, [
    state.gameOver,
    state.dailySolved,
    mathOpen,
    guideActive,
    hintsLeft,
    settings,
    bumpActivity,
    playSolutionGuide,
  ]);

  const submitMath = useCallback(() => {
    if (!mathChallenge) return;
    const parsed = Number.parseInt(mathInput.trim(), 10);
    if (Number.isNaN(parsed) || parsed !== mathChallenge.answer) {
      setMathError(true);
      playSfx("reject", settings.sound);
      haptic(settings.haptics, 25);
      return;
    }
    setMathOpen(false);
    setMathChallenge(null);
    setMathInput("");
    setMathError(false);
    const pending = pendingGuideRef.current;
    pendingGuideRef.current = null;
    if (pending) {
      setHintScore(pending.potentialScore);
      playSolutionGuide(pending.tileIds, pending.edges, { complete: true });
    }
    playSfx("loop", settings.sound);
    haptic(settings.haptics, 10);
  }, [mathChallenge, mathInput, settings, playSolutionGuide]);

  const tutorialHighlights = useMemo(() => {
    if (view !== "tutorial") return [];
    const a = state.board[3]?.[0]?.id;
    const b = state.board[3]?.[1]?.id;
    const c = state.board[4]?.[1]?.id;
    const d = state.board[4]?.[0]?.id;
    if (tutorialStep === 1 && a && b) return [a, b];
    if (tutorialStep === 2 && b && c) return [b, c];
    if (tutorialStep === 3 && c && d) return [c, d];
    if (tutorialStep === 4 && d && a) return [d, a];
    return [];
  }, [view, tutorialStep, state.board]);

  const tutorialCopy =
    tutorialStep === 1
      ? "Connect matching symbols or colors."
      : tutorialStep === 2
        ? "Each tile can have only 2 connections."
        : tutorialStep === 3
          ? "Close the loop."
          : tutorialStep >= 4
            ? "Nice."
            : "";

  useEffect(() => {
    if (view === "tutorial" && tutorialStep >= 4 && state.stats.loopsCreated > 0) {
      const t = setTimeout(() => {
        setTutorialDone();
        dispatch({ type: "REPLACE", state: newEndlessGame() });
        setView("play");
      }, 700);
      return () => clearTimeout(t);
    }
  }, [view, tutorialStep, state.stats.loopsCreated]);

  const onShare = async () => {
    const text =
      state.mode === "daily"
        ? formatDailyShare({
            dateStr: dateKey(),
            moves: state.moveCount,
            limit: state.dailyMoveLimit,
            solved: state.dailySolved,
            score: state.score,
            streak: streak.current,
            objectives: state.dailyObjectives,
            progress: state.dailyProgress
              ? {
                  ...state.dailyProgress,
                  scoreGoalMet:
                    state.dailyProgress.scoreGoalMet ||
                    state.score >= (state.dailyObjectives?.targetScore ?? 0),
                }
              : null,
          })
        : formatEndlessShare(
            state.score,
            state.stats.loopsCreated,
            Math.max(1, state.stats.longestCombo),
          );
    const ok = await shareText(text);
    setShareNote(ok ? "Copied / shared" : "Unable to share");
    setTimeout(() => setShareNote(null), 1600);
  };

  if (view === "home") {
    return (
      <Shell>
        <main className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
          <div className="text-center">
            <h1 className="font-[family-name:var(--font-display)] text-6xl font-semibold tracking-[-0.04em] text-[#1E2A32] sm:text-7xl">
              LINK
            </h1>
            <p className="mt-3 text-sm tracking-wide text-[#1E2A32]/55">
              Create. Connect. Clear.
            </p>
          </div>
          <PrimaryButton onClick={startEndless} className="min-w-[200px]">
            {hasSession ? "CONTINUE" : "PLAY"}
          </PrimaryButton>
          {hasSession ? (
            <GhostButton
              onClick={() => {
                clearSession();
                setHasSession(false);
                clearPathUi();
                dispatch({ type: "REPLACE", state: newEndlessGame() });
                setView("play");
              }}
            >
              New Game
            </GhostButton>
          ) : null}
          <p className="text-sm text-[#1E2A32]/45">
            Best Score: {best}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <GhostButton onClick={() => setView("how")}>How to Play</GhostButton>
            <GhostButton onClick={startDaily}>Daily</GhostButton>
            <GhostButton
              onClick={() => {
                setStats(loadStats());
                setView("stats");
              }}
            >
              Statistics
            </GhostButton>
            <GhostButton onClick={() => setView("settings")}>Settings</GhostButton>
          </div>
        </main>
      </Shell>
    );
  }

  if (view === "how") {
    return (
      <Shell>
        <header className="flex items-center justify-between py-2">
          <GhostButton onClick={() => setView("home")}>← Back</GhostButton>
        </header>
        <div className="space-y-5 py-2 pb-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            How to Play
          </h2>
          <HowToPlayVideo />
          <div className="space-y-2 px-1 text-sm text-[#1E2A32]/55">
            <p>Same symbol or color · max 2 links · close a loop of 4+.</p>
            <p>
              ★ Wilds match anything · 🔒 locks open beside a clear · ↗ bridges
              link diagonally.
            </p>
            <p>
              Chain clears for combo fever · hints show a path then clear it for
              you.
            </p>
            <p>Wrong connections can block future moves. Think ahead.</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (view === "stats") {
    const marks = streakCalendarMarks(streak.solvedDates, 14);
    return (
      <Shell>
        <header className="flex items-center justify-between py-2">
          <GhostButton onClick={() => setView("home")}>← Back</GhostButton>
        </header>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Statistics
        </h2>
        <div className="mt-5 rounded-2xl bg-black/[0.03] px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-[#1E2A32]/4">
            Daily streak
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {streak.current}{" "}
            <span className="text-sm font-normal text-[#1E2A32]/45">
              (best {streak.best})
            </span>
          </p>
          <div className="mt-3 flex gap-1">
            {marks.map((m) => (
              <span
                key={m.date}
                title={m.date}
                className={[
                  "h-2.5 flex-1 rounded-full",
                  m.solved ? "bg-[#2A9D8F]" : "bg-black/10",
                ].join(" ")}
              />
            ))}
          </div>
        </div>
        <dl className="mt-6 space-y-3 text-sm">
          {(
            [
              ["Games Played", stats.gamesPlayed],
              ["Best Score", stats.bestScore],
              ["Total Score", stats.totalScore],
              ["Total Loops", stats.totalLoops],
              ["Largest Loop", stats.largestLoop],
              ["Best Combo", stats.bestCombo],
              ["Total Connections", stats.totalConnections],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-black/5 py-2"
            >
              <dt className="text-[#1E2A32]/55">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Shell>
    );
  }

  if (view === "settings") {
    return (
      <Shell>
        <header className="flex items-center justify-between py-2">
          <GhostButton onClick={() => setView("home")}>← Back</GhostButton>
        </header>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Settings
        </h2>
        <div className="mt-6 space-y-4">
          <label className="flex items-center justify-between rounded-2xl bg-white/50 px-4 py-3">
            <span>Sound</span>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => updateSettings({ sound: e.target.checked })}
              className="h-5 w-5 accent-[#2A9D8F]"
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl bg-white/50 px-4 py-3">
            <span>Haptics</span>
            <input
              type="checkbox"
              checked={settings.haptics}
              onChange={(e) => updateSettings({ haptics: e.target.checked })}
              className="h-5 w-5 accent-[#2A9D8F]"
            />
          </label>
        </div>
      </Shell>
    );
  }

  // Play / Daily / Tutorial
  const showDailyHud = view === "daily";
  const boardHighlights =
    view === "tutorial" ? tutorialHighlights : hintIds;

  return (
    <Shell>
      <header className="flex items-center justify-between gap-1 py-2">
        <GhostButton
          onClick={() => {
            if (state.mode === "endless" && state.score > 0) {
              setBest(recordBestScore(state.score));
              saveSession(state);
              setHasSession(!state.gameOver);
            }
            setView("home");
            setBest(loadStats().bestScore);
          }}
        >
          ← Home
        </GhostButton>
        <div className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
          {showDailyHud ? "DAILY" : "LINK"}
        </div>
        <div className="flex items-center">
          <IconButton
            label="Hint"
            disabled={
              state.gameOver ||
              state.dailySolved ||
              view === "tutorial" ||
              mathOpen ||
              guideActive
            }
            onClick={useHint}
          >
            Hint ({hintsLeft}/{MAX_HINTS})
          </IconButton>
        </div>
      </header>

      {showDailyHud && state.dailyObjectives && state.dailyProgress && (
        <div className="-mt-1 mb-2 space-y-1.5 rounded-2xl bg-black/[0.03] px-3 py-2">
          <p className="text-center text-[11px] uppercase tracking-wider text-[#1E2A32]/4">
            Today&apos;s goals
            {streak.current > 0 ? ` · streak ${streak.current}` : ""}
          </p>
          <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-[#1E2A32]/7">
            <li>
              {(state.dailyProgress.bestLoopSize >=
              state.dailyObjectives.minLoopSize
                ? "✓"
                : "○")}{" "}
              loop ≥{state.dailyObjectives.minLoopSize}
            </li>
            <li>
              {(state.dailyProgress.wildsUsed <=
              state.dailyObjectives.maxWildUses
                ? "✓"
                : "○")}{" "}
              ≤{state.dailyObjectives.maxWildUses} wild
            </li>
            <li>
              {(state.score >= state.dailyObjectives.targetScore ? "✓" : "○")} ≥
              {state.dailyObjectives.targetScore} pts
            </li>
          </ul>
          <p className="text-center text-[11px] text-[#1E2A32]/4">
            Clear the board in {state.dailyMoveLimit} moves
          </p>
        </div>
      )}

      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#1E2A32]/40">
            Score
          </div>
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            {state.score}
          </div>
          {!showDailyHud && (
            <div className="mt-0.5 text-[11px] text-[#1E2A32]/4">
              Stage {state.difficultyStage + 1} ·{" "}
              {
                DIFFICULTY_STAGES[
                  Math.min(state.difficultyStage, DIFFICULTY_STAGES.length - 1)
                ]!.symbols
              }
              ×
              {
                DIFFICULTY_STAGES[
                  Math.min(state.difficultyStage, DIFFICULTY_STAGES.length - 1)
                ]!.colors
              }
            </div>
          )}
        </div>
        <div className="text-right">
          {showDailyHud ? (
            <>
              <div className="text-xs uppercase tracking-wider text-[#1E2A32]/40">
                Moves
              </div>
              <div className="text-xl font-semibold tabular-nums">
                {state.moveCount} / {state.dailyMoveLimit}
              </div>
            </>
          ) : (
            <ComboMeter combo={state.combo} broken={comboBroken} />
          )}
        </div>
      </div>

      {(stageToast || teachToast) && (
        <p className="mb-2 text-center text-sm font-medium text-[#2A9D8F] animate-[fadeCaption_280ms_ease-out]">
          {teachToast ?? stageToast}
        </p>
      )}

      {view === "tutorial" && (
        <p className="mb-3 text-center text-sm font-medium text-[#1E2A32]/70">
          {tutorialCopy}
        </p>
      )}

      <Board
        state={state}
        pathIds={pathIds}
        drawing={drawing}
        rejectId={rejectId}
        onPathStart={onPathStart}
        onPathMove={onPathMove}
        onPathEnd={onPathEnd}
        highlightIds={boardHighlights}
        hintEdges={view === "tutorial" ? [] : hintEdges}
        guidePath={guidePath}
        guideActive={guideActive}
      />

      {mathOpen && mathChallenge && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-4 sm:items-center">
          <div className="relative z-10 w-full max-w-sm rounded-3xl bg-[#FBFBFA] p-6 shadow-xl">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              Quick puzzle
            </h3>
            <p className="mt-2 text-sm text-[#1E2A32]/55">
              Solve this to continue.
            </p>
            <p className="mt-6 text-center font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">
              {mathChallenge.prompt} = ?
            </p>
            <input
              type="number"
              inputMode="numeric"
              value={mathInput}
              onChange={(e) => {
                setMathInput(e.target.value);
                setMathError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitMath();
              }}
              autoFocus
              className={[
                "mt-5 w-full rounded-2xl border bg-white px-4 py-3 text-center text-xl tabular-nums outline-none",
                mathError
                  ? "border-[#E85D4C] ring-2 ring-[#E85D4C]/20"
                  : "border-black/10 focus:ring-2 focus:ring-[#2A9D8F]/25",
              ].join(" ")}
              placeholder="Answer"
            />
            {mathError && (
              <p className="mt-2 text-center text-xs text-[#E85D4C]">
                Not quite — try again
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2">
              <PrimaryButton onClick={submitMath}>Continue</PrimaryButton>
              <GhostButton
                onClick={() => {
                  setMathOpen(false);
                  setMathChallenge(null);
                  pendingGuideRef.current = null;
                  setMathInput("");
                }}
              >
                Cancel
              </GhostButton>
            </div>
          </div>
        </div>
      )}

      {freeHintFlash && (
        <p className="mt-2 text-center text-sm font-medium text-[#2A9D8F]">
          Free hint earned!
        </p>
      )}

      {guideActive && (
        <p className="mt-3 text-center text-sm font-medium text-[#E9A319]">
          {guideWillComplete
            ? "Showing path… then clearing"
            : "A nudge — half the path"}
        </p>
      )}

      <p className="mt-4 text-center text-xs text-[#1E2A32]/35">
        Drag a full loop to clear · lift early and the path is discarded
        {hintIds.length > 0
          ? ` · best loop: ${hintIds.length} tiles (~${hintScore} pts)`
          : ""}
      </p>

      {(state.gameOver || state.dailySolved) && (
        <Modal
          title={
            state.dailySolved
              ? "Solved!"
              : state.mode === "daily"
                ? "Out of Moves"
                : "GAME OVER"
          }
          onClose={() => {
            if (
              state.mode === "endless" &&
              state.gameOver &&
              state.recoveryUndosLeft > 0 &&
              state.preClearSnapshot
            ) {
              // Closing recoverable GO without undoing = give up
              dispatch({ type: "ACCEPT_GAME_OVER" });
            }
            setView("home");
          }}
        >
          {state.dailySolved ? (
            <div className="mb-4 space-y-2 text-sm text-[#1E2A32]/65">
              <p>
                {state.moveCount} moves · {state.score} pts
                {streak.current > 0 ? ` · streak ${streak.current}` : ""}
              </p>
              {state.dailyObjectives && state.dailyProgress && (
                <ul className="space-y-1 text-xs">
                  <li>
                    {state.dailyProgress.bestLoopSize >=
                    state.dailyObjectives.minLoopSize
                      ? "✓"
                      : "○"}{" "}
                    Loop ≥{state.dailyObjectives.minLoopSize}
                  </li>
                  <li>
                    {state.dailyProgress.wildsUsed <=
                    state.dailyObjectives.maxWildUses
                      ? "✓"
                      : "○"}{" "}
                    ≤{state.dailyObjectives.maxWildUses} wild uses
                  </li>
                  <li>
                    {state.score >= state.dailyObjectives.targetScore
                      ? "✓"
                      : "○"}{" "}
                    ≥{state.dailyObjectives.targetScore} score
                  </li>
                </ul>
              )}
            </div>
          ) : (
            <div className="mb-5 space-y-3">
              {state.mode === "endless" && (
                <p className="text-sm text-[#1E2A32]/65">
                  No connections left.
                  {state.recoveryUndosLeft > 0 && state.preClearSnapshot
                    ? " A longer loop might have kept you alive — undo and try again?"
                    : ""}
                </p>
              )}
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#1E2A32]/5">Score</dt>
                  <dd className="font-semibold tabular-nums">{state.score}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#1E2A32]/5">Best Score</dt>
                  <dd className="font-semibold tabular-nums">{best}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#1E2A32]/5">Largest loop</dt>
                  <dd className="font-semibold tabular-nums">
                    {state.stats.largestLoop}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#1E2A32]/5">Max combo</dt>
                  <dd className="font-semibold tabular-nums">
                    ×{Math.max(1, state.stats.longestCombo)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#1E2A32]/5">Hints left</dt>
                  <dd className="font-semibold tabular-nums">{hintsLeft}</dd>
                </div>
              </dl>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {state.mode === "endless" &&
            state.gameOver &&
            state.recoveryUndosLeft > 0 &&
            state.preClearSnapshot ? (
              <>
                <PrimaryButton
                  onClick={() => {
                    dispatch({ type: "RECOVER_UNDO" });
                    clearPathUi();
                    setHintIds([]);
                    setHintEdges([]);
                    playSfx("select", settings.sound);
                  }}
                >
                  Undo ({state.recoveryUndosLeft} left)
                </PrimaryButton>
                <GhostButton
                  onClick={() => {
                    // Finalize run stats, then start a new endless game
                    if (!recordedGameOver.current) {
                      recordedGameOver.current = true;
                      playSfx("gameover", settings.sound);
                      haptic(settings.haptics, [30, 40, 30]);
                      const s = loadStats();
                      s.gamesPlayed += 1;
                      s.totalScore += state.score;
                      s.bestScore = Math.max(s.bestScore, state.score);
                      s.totalLoops += state.stats.loopsCreated;
                      s.largestLoop = Math.max(
                        s.largestLoop,
                        state.stats.largestLoop,
                      );
                      s.bestCombo = Math.max(
                        s.bestCombo,
                        state.stats.longestCombo,
                      );
                      s.totalConnections += state.stats.totalConnections;
                      saveStats(s);
                      setBest(s.bestScore);
                      setStats(s);
                    }
                    setHintIds([]);
                    setHintEdges([]);
                    setHintsLeft(STARTING_HINTS);
                    clearPathUi();
                    clearSession();
                    dispatch({ type: "REPLACE", state: newEndlessGame() });
                    setView("play");
                    recordedGameOver.current = false;
                  }}
                >
                  Give up
                </GhostButton>
              </>
            ) : (
              <>
                <PrimaryButton
                  onClick={() => {
                    recordedGameOver.current = false;
                    setHintIds([]);
                    setHintEdges([]);
                    setHintsLeft(STARTING_HINTS);
                    clearPathUi();
                    clearSession();
                    if (state.mode === "daily") startDaily();
                    else {
                      dispatch({ type: "REPLACE", state: newEndlessGame() });
                      setView("play");
                    }
                  }}
                >
                  Play Again
                </PrimaryButton>
                <GhostButton onClick={onShare}>Share Score</GhostButton>
                {shareNote && (
                  <p className="text-center text-xs text-[#2A9D8F]">
                    {shareNote}
                  </p>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </Shell>
  );
}
