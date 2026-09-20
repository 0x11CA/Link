"use client";

import { useCallback, useReducer } from "react";
import { newDailyGame, newEndlessGame, reduce } from "@/game/actions";
import type { GameAction, GameMode, GameState } from "@/types/game";

function reducer(state: GameState, action: GameAction): GameState {
  return reduce(state, action);
}

export function useGame(mode: GameMode = "endless", date?: string) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () =>
      mode === "daily"
        ? newDailyGame(date ?? new Date().toISOString().slice(0, 10))
        : newEndlessGame(),
  );

  const select = useCallback((tileId: string) => {
    dispatch({ type: "SELECT", tileId });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "UNDO" });
  }, []);

  return { state, dispatch, select, undo };
}

export function createGame(mode: GameMode, date?: string): GameState {
  if (mode === "daily") {
    return newDailyGame(date ?? new Date().toISOString().slice(0, 10));
  }
  return newEndlessGame();
}
