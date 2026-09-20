"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { HowToPlayVideo } from "@/components/HowToPlayVideo";
import { Board } from "@/components/Board";
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
import { dateKey, formatDailyShare, formatEndlessShare } from "@/game/daily";
import { suggestHint } from "@/game/hints";
import { HINT_PENALTIES, STARTING_HINTS } from "@/game/config";
import type { GameAction, GameState } from "@/types/game";
import { playSfx } from "@/lib/audio";
import { haptic } from "@/lib/haptics";
import { shareText } from "@/lib/share";
import {
  clearSession,
  isTutorialDone,
  loadSession,
  loadSettings,
  loadStats,
  recordBestScore,
  saveDailyResult,
  saveSession,
  saveSettings,
  saveStats,
  setTutorialDone,
} from "@/lib/storage";
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
  const board = base.board.map((row) => row.map((t) => (t ? { ...t, connections: [] as string[], locked: false, wild: false } : null)));
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
  const [hintPenaltyFlash, setHintPenaltyFlash] = useState<number | null>(null);
  const [hintsLeft, setHintsLeft] = useState(STARTING_HINTS);
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const pathStepsRef = useRef(0);
  const pathIdsRef = useRef<string[]>([]);
  const stateRef = useRef(state);
  const recordedGameOver = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    pathIdsRef.current = pathIds;
  }, [pathIds]);


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
    if (state.gameOver && state.mode === "endless" && !recordedGameOver.current) {
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
  }, [state.gameOver, state.mode, state.score, state.stats, settings.sound, settings.haptics]);

  useEffect(() => {
    if (state.dailySolved && state.mode === "daily") {
      saveDailyResult({
        date: dateKey(),
        solved: true,
        moves: state.moveCount,
        limit: state.dailyMoveLimit,
      });
    }
  }, [state.dailySolved, state.mode, state.moveCount, state.dailyMoveLimit]);

  useEffect(() => {
    if (state.lastClearSize) {
      if (state.combo > 2) playSfx("combo", settings.sound);
      else playSfx("loop", settings.sound);
      haptic(settings.haptics, [10, 20, 10]);
    }
  }, [state.lastClearSize, state.clearsCount]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const onPathStart = useCallback(
    (tileId: string) => {
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
      playSfx("select", settings.sound);
      haptic(settings.haptics, 8);
    },
    [pulseReject, settings],
  );

  const onPathMove = useCallback(
    (tileId: string) => {
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
    [pulseReject, settings, view, clearPathUi],
  );

  const onPathEnd = useCallback(() => {
    setDrawing(false);
  }, []);

  const useHint = useCallback(() => {
    if (hintsLeft <= 0 || state.gameOver || state.dailySolved) return;
    const suggestion = suggestHint(stateRef.current);
    if (!suggestion) {
      playSfx("reject", settings.sound);
      return;
    }

    const usedIndex = STARTING_HINTS - hintsLeft; // 0..4
    const penalty =
      HINT_PENALTIES[Math.min(usedIndex, HINT_PENALTIES.length - 1)] ?? 180;

    let s = stateRef.current;
    const nextScore = Math.max(0, s.score - penalty);
    s = { ...s, score: nextScore, combo: 1 };
    stateRef.current = s;
    dispatch({ type: "REPLACE", state: s });

    setHintsLeft((n) => n - 1);
    setHintIds(suggestion.tileIds);
    setHintEdges(suggestion.edges);
    setHintScore(suggestion.potentialScore);
    setHintPenaltyFlash(penalty);
    window.setTimeout(() => setHintPenaltyFlash(null), 900);

    playSfx("select", settings.sound);
    haptic(settings.haptics, 10);
  }, [hintsLeft, state.gameOver, state.dailySolved, settings]);

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
        ? formatDailyShare(
            dateKey(),
            state.moveCount,
            state.dailyMoveLimit,
            state.dailySolved,
          )
        : formatEndlessShare(state.score, state.stats.loopsCreated);
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
            <p>Wrong connections can block future moves. Think ahead.</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (view === "stats") {
    return (
      <Shell>
        <header className="flex items-center justify-between py-2">
          <GhostButton onClick={() => setView("home")}>← Back</GhostButton>
        </header>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Statistics
        </h2>
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
          {pathIds.length > 1 ? (
            <IconButton label="Cancel path" onClick={cancelPath}>
              Cancel
            </IconButton>
          ) : null}
          <IconButton
            label="Hint"
            disabled={
              hintsLeft <= 0 ||
              state.gameOver ||
              state.dailySolved ||
              view === "tutorial"
            }
            onClick={useHint}
          >
            Hint ({hintsLeft}/{STARTING_HINTS})
          </IconButton>
          <IconButton
            label="Undo"
            disabled={state.history.length === 0 && pathIds.length <= 1}
            onClick={() => {
              setHintIds([]);
              setHintEdges([]);
              // During an active path: step back one link (free)
              if (pathIds.length > 1 || pathStepsRef.current > 0) {
                const path = pathIdsRef.current;
                if (path.length >= 2) {
                  let s = reduce(stateRef.current, { type: "REVERT" });
                  stateRef.current = s;
                  dispatch({ type: "REPLACE", state: s });
                  pathStepsRef.current = Math.max(0, pathStepsRef.current - 1);
                  const nextPath = path.slice(0, -1);
                  pathIdsRef.current = nextPath;
                  setPathIds(nextPath);
                  playSfx("select", settings.sound);
                  return;
                }
                cancelPath();
                return;
              }
              clearPathUi();
              dispatch({ type: "UNDO" });
            }}
          >
            Undo
          </IconButton>
        </div>
      </header>

      {showDailyHud && (
        <p className="-mt-1 mb-2 text-center text-xs text-[#1E2A32]/45">
          Today&apos;s Puzzle — clear the board in {state.dailyMoveLimit}{" "}
          moves. Decoys &amp; locks make it tricky; undos don&apos;t refund
          moves.
        </p>
      )}

      <div className="mb-3 flex items-end justify-between px-1">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#1E2A32]/40">
            Score
          </div>
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            {state.score}
          </div>
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
            <>
              <div className="text-xs uppercase tracking-wider text-[#1E2A32]/40">
                Combo
              </div>
              <div
                className={`text-xl font-semibold tabular-nums transition ${
                  state.combo > 1 ? "text-[#2A9D8F]" : "text-[#1E2A32]/50"
                }`}
              >
                ×{state.combo}
              </div>
            </>
          )}
        </div>
      </div>

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
      />

      <p className="mt-4 text-center text-xs text-[#1E2A32]/35">
        Drag through tiles to link · Cancel undoes the whole path
        {hintIds.length > 0
          ? ` · best loop: ${hintIds.length} tiles (~${hintScore} pts)`
          : ""}
        {hintPenaltyFlash != null ? ` · hint −${hintPenaltyFlash}` : ""}
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
          onClose={() => setView("home")}
        >
          {state.dailySolved ? (
            <p className="mb-4 text-[#1E2A32]/65">
              {state.moveCount} Moves
            </p>
          ) : (
            <dl className="mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#1E2A32]/5">Score</dt>
                <dd className="font-semibold tabular-nums">{state.score}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#1E2A32]/5">Best Score</dt>
                <dd className="font-semibold tabular-nums">{best}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#1E2A32]/5">Loops Created</dt>
                <dd className="font-semibold tabular-nums">
                  {state.stats.loopsCreated}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#1E2A32]/5">Largest Loop</dt>
                <dd className="font-semibold tabular-nums">
                  {state.stats.largestLoop}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#1E2A32]/5">Longest Combo</dt>
                <dd className="font-semibold tabular-nums">
                  ×{state.stats.longestCombo}
                </dd>
              </div>
            </dl>
          )}
          <div className="flex flex-col gap-2">
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
              <p className="text-center text-xs text-[#2A9D8F]">{shareNote}</p>
            )}
          </div>
        </Modal>
      )}
    </Shell>
  );
}
