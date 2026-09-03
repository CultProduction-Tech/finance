"use client";

// Два представления графика (ТЗ Кости, 07.07): «НИ» — накопительно,
// «Месяц» — выбранный месяц (по умолчанию текущий). Рядом — подпись
// или селектор месяца. Произвольные диапазоны — через верхнюю панель.

import { MONTHS_RU } from "@/types/finance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ChartMode = "ni" | "month";

interface ChartPeriodSelectorProps {
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  /** Подпись периода в режиме «НИ»: «Янв–Июл», «Мар–Май» */
  periodLabel: string;
  /** Выбранный месяц (0–11) в режиме «Месяц» */
  selectedMonth: number;
  onSelectedMonthChange: (month: number) => void;
  /** Текущий календарный месяц — для пометки «(идёт)» */
  currentMonth: number;
}

export function ChartPeriodSelector({
  mode,
  onModeChange,
  periodLabel,
  selectedMonth,
  onSelectedMonthChange,
  currentMonth,
}: ChartPeriodSelectorProps) {
  const pillBase = "inline-flex items-center justify-center rounded-full px-2.5 h-6 text-[11px] font-medium transition-all";
  const activeBtn = `${pillBase} bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] shadow-[0_1px_1px_rgba(0,0,0,0.10)]`;
  const inactiveBtn = `${pillBase} bg-white text-[#1d1d1f] ring-1 ring-black/[0.08] shadow-[0_1px_1px_rgba(0,0,0,0.04)] hover:ring-black/[0.14] hover:shadow-[0_1px_2px_rgba(0,0,0,0.07)]`;

  const monthTriggerLabel =
    selectedMonth === currentMonth
      ? `${MONTHS_RU[selectedMonth]} (идёт)`
      : MONTHS_RU[selectedMonth];

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={() => onModeChange("ni")} className={mode === "ni" ? activeBtn : inactiveBtn}>
        НИ
      </button>
      <button onClick={() => onModeChange("month")} className={mode === "month" ? activeBtn : inactiveBtn}>
        Месяц
      </button>
      {mode === "month" ? (
        <Select
          value={String(selectedMonth)}
          onValueChange={(v) => {
            if (v == null) return;
            onSelectedMonthChange(Number(v));
          }}
        >
          <SelectTrigger size="pillSm" className="min-w-[7.5rem] text-[#86868b]">
            <SelectValue>{monthTriggerLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {MONTHS_RU.map((name, idx) => (
              <SelectItem key={name} value={String(idx)}>
                {idx === currentMonth ? `${name} (идёт)` : name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-[11px] text-[#86868b] tabular-nums whitespace-nowrap">{periodLabel}</span>
      )}
    </div>
  );
}
