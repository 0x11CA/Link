"use client";

import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(165deg,#F3F1ED_0%,#E8E4DE_48%,#F7F5F1_100%)] text-[#1E2A32]">
      <div
        className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl px-3 py-2 text-sm font-medium text-[#1E2A32]/70 transition hover:bg-black/5 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl bg-[#1E2A32] px-8 py-3.5 text-base font-semibold tracking-wide text-[#F7F5F1] shadow-[0_8px_24px_rgba(30,42,50,0.2)] transition active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-3 py-2 text-sm font-medium text-[#1E2A32]/55 transition hover:bg-black/5"
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 sm:items-center">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl bg-[#FBFBFA] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[#1E2A32]/50"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
