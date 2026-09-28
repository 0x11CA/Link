"use client";

import { FEVER_COMBO_THRESHOLD } from "@/game/config";
import { isFeverCombo } from "@/game/scoring";

export function ComboMeter({
  combo,
  broken,
}: {
  combo: number;
  broken?: boolean;
}) {
  const fever = isFeverCombo(combo);
  const segments = FEVER_COMBO_THRESHOLD;
  const filled = Math.min(combo, segments);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="text-xs uppercase tracking-wider text-[#1E2A32]/40">
        {fever ? "Fever" : "Combo"}
      </div>
      <div
        className={[
          "text-xl font-semibold tabular-nums transition",
          broken
            ? "text-[#E85D4C]"
            : fever
              ? "text-[#E9A319]"
              : combo > 1
                ? "text-[#2A9D8F]"
                : "text-[#1E2A32]/50",
        ].join(" ")}
      >
        ×{combo}
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={[
              "h-1.5 w-3 rounded-full transition-colors",
              i < filled
                ? fever
                  ? "bg-[#E9A319]"
                  : "bg-[#2A9D8F]"
                : "bg-black/10",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
