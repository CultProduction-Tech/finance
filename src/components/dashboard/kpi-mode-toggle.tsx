"use client";

import { cn } from "@/lib/utils";

export type KpiMode = "monthly" | "cumulative";

interface KpiModeToggleProps {
  mode: KpiMode;
  onChange: (mode: KpiMode) => void;
}

export function KpiModeToggle({ mode, onChange }: KpiModeToggleProps) {
  const baseClass =
    "px-3 py-1 text-[12px] font-medium rounded-full transition-colors leading-none";
  const activeClass = "bg-[#1d1d1f] text-white";
  const inactiveClass =
    "text-muted-foreground hover:text-foreground";

  return (
    <div className="inline-flex items-center gap-0.5 bg-white/80 rounded-full p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={cn(baseClass, mode === "monthly" ? activeClass : inactiveClass)}
        aria-pressed={mode === "monthly"}
      >
        Помесячно
      </button>
      <button
        type="button"
        onClick={() => onChange("cumulative")}
        className={cn(baseClass, mode === "cumulative" ? activeClass : inactiveClass)}
        aria-pressed={mode === "cumulative"}
      >
        НИ
      </button>
    </div>
  );
}
