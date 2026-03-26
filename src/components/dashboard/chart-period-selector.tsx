"use client";

import { MONTHS_RU } from "@/types/finance";

interface ChartPeriodSelectorProps {
  year: number;
  startMonth: number;
  endMonth: number;
  onYearChange: (year: number) => void;
  onStartMonthChange: (month: number) => void;
  onEndMonthChange: (month: number) => void;
}

const selectClass = "bg-muted/60 border border-border rounded-md px-1.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer";

export function ChartPeriodSelector({
  year,
  startMonth,
  endMonth,
  onYearChange,
  onStartMonthChange,
  onEndMonthChange,
}: ChartPeriodSelectorProps) {
  return (
    <div className="flex items-center gap-1 text-xs shrink-0">
      <select
        value={year}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className={selectClass}
      >
        <option value={2025}>2025</option>
        <option value={2026}>2026</option>
        <option value={2027}>2027</option>
      </select>
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
