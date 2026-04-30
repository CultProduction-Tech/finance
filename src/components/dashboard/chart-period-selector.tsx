"use client";

import { MONTHS_RU } from "@/types/finance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function ChartPeriodSelector({
  startMonth,
  endMonth,
  activeQuick,
  onStartMonthChange,
  onEndMonthChange,
  onQuickPeriod,
  hideMonthButton,
}: ChartPeriodSelectorProps) {
  const isCustomInterval = activeQuick === null;

  const pillBase = "inline-flex items-center justify-center rounded-full px-2.5 h-6 text-[11px] font-medium transition-all";
  const activeBtn = `${pillBase} bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] shadow-[0_1px_1px_rgba(0,0,0,0.10)]`;
  const inactiveBtn = `${pillBase} bg-white text-[#1d1d1f] ring-1 ring-black/[0.08] shadow-[0_1px_1px_rgba(0,0,0,0.04)] hover:ring-black/[0.14] hover:shadow-[0_1px_2px_rgba(0,0,0,0.07)]`;

  const monthAccent = isCustomInterval
    ? "bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] ring-0 shadow-[0_1px_1px_rgba(0,0,0,0.10)] hover:ring-0 [&_svg]:text-[var(--accent-solid-foreground)]"
    : "";

  return (
    <div className="flex items-center gap-1 shrink-0">
      {!hideMonthButton && (
        <button
          onClick={() => onQuickPeriod(activeQuick === "month" ? null : "month")}
          className={activeQuick === "month" ? activeBtn : inactiveBtn}
        >
          Месяц
        </button>
      )}
      <button
        onClick={() => onQuickPeriod(activeQuick === "year" ? null : "year")}
        className={activeQuick === "year" ? activeBtn : inactiveBtn}
      >
        НИ
      </button>

      <Select
        value={String(startMonth)}
        onValueChange={(v) => {
          const idx = Number(v);
          onStartMonthChange(idx);
          if (idx > endMonth) onEndMonthChange(idx);
        }}
      >
        <SelectTrigger size="pillSm" className={`w-[64px] ${monthAccent}`}>
          <SelectValue>
            {(value: string) =>
              MONTHS_RU[Number(value)]?.substring(0, 3) ?? ""
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MONTHS_RU.map((m, i) => (
            <SelectItem key={m} value={String(i)}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-[#86868b] text-[11px]">—</span>

      <Select
        value={String(endMonth)}
        onValueChange={(v) => {
          const idx = Number(v);
          onEndMonthChange(idx);
          if (idx < startMonth) onStartMonthChange(idx);
        }}
      >
        <SelectTrigger size="pillSm" className={`w-[64px] ${monthAccent}`}>
          <SelectValue>
            {(value: string) =>
              MONTHS_RU[Number(value)]?.substring(0, 3) ?? ""
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MONTHS_RU.map((m, i) => (
            <SelectItem key={m} value={String(i)}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
