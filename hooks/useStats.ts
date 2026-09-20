"use client";

import { useCallback, useEffect, useState } from "react";
import type { PersistedStats } from "@/types/game";
import { defaultStats, loadStats } from "@/lib/storage";

export function useStats() {
  const [stats, setStats] = useState<PersistedStats>(defaultStats);

  const refresh = useCallback(() => {
    setStats(loadStats());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, refresh };
}
