"use client";

import { useCallback, useEffect, useState } from "react";
import type { Settings } from "@/types/game";
import { defaultSettings, loadSettings, saveSettings } from "@/lib/storage";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}
