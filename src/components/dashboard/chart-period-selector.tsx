"use client";

import { MONTHS_RU } from "@/types/finance";

export type QuickPeriod = "month" | "year" | null;

interface ChartPeriodSelectorProps {
  startMonth: number;
  endMonth: number;
  activeQuick: QuickPeriod;
  onStartMonthChange: (month: number) => void;
  onEndMonthChange: (month: number) => void;
  onQuickPeriod: (period: QuickPeriod) => void;
  hideMonthButton?: boolean;
}

const selectBase = "rounded-md px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer border";
const selectInactive = "bg-muted/60 border-border text-foreground";
const selectActive = "bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border-[var(--accent-solid)]";

export function ChartPeriodSelector({
  startMonth,
  endMonth,
  activeQuick,
  onStartMonthChange,
  onEndMonthChange,
  onQuickPeriod,
  hideMonthButton,
}: ChartPeriodSelectorProps) {
  const btnBase = "rounded-md px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer border";
  // Если ни один пресет не активен — интервал кастомный, подсвечиваем дропдауны
  const isCustomInterval = activeQuick === null;
  const selectClass = `${selectBase} ${isCustomInterval ? selectActive : selectInactive}`;

  return (
    <div className="flex items-center gap-1 text-xs shrink-0">
      {!hideMonthButton && (
        <button
          onClick={() => onQuickPeriod(activeQuick === "month" ? null : "month")}
          className={`${btnBase} ${
            activeQuick === "month"
              ? "bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border-[var(--accent-solid)]"
              : "bg-muted/60 border-border text-foreground hover:bg-muted"
          }`}
        >
          Месяц
        </button>
      )}
      <button
        onClick={() => onQuickPeriod(activeQuick === "year" ? null : "year")}
        className={`${btnBase} ${
          activeQuick === "year"
            ? "bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border-[var(--accent-solid)]"
            : "bg-muted/60 border-border text-foreground hover:bg-muted"
        }`}
      >
        НИ
      </button>
      <select
        value={startMonth}
        onChange={(e) => {
          const v = Number(e.target.value);
          onStartMonthChange(v);
          if (v > endMonth) onEndMonthChange(v);
        }}
        className={selectClass}
      >
        {MONTHS_RU.map((m, i) => (
          <option key={m} value={i}>{m.substring(0, 3)}</option>
        ))}
      </select>
      <span className="text-muted-foreground">—</span>
      <select
        value={endMonth}
        onChange={(e) => {
          const v = Number(e.target.value);
          onEndMonthChange(v);
          if (v < startMonth) onStartMonthChange(v);
        }}
        className={selectClass}
      >
        {MONTHS_RU.map((m, i) => (
          <option key={m} value={i}>{m.substring(0, 3)}</option>
        ))}
      </select>
    </div>
  );
}
