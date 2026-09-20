"use client";

import { GameApp } from "@/components/GameApp";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // offline optional
      });
    }
  }, []);

  return <GameApp />;
}
