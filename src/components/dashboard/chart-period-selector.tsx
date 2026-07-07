"use client";

// Два представления графика (ТЗ Кости, 07.07): «НИ» — накопительно,
// «Месяц» — текущий (неполный). Рядом — подпись разрешённого периода,
// чтобы всегда было видно, какие месяцы на графике. Произвольные
// диапазоны — только через верхнюю панель дашборда.

export type ChartMode = "ni" | "month";

interface ChartPeriodSelectorProps {
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  /** Подпись периода: «Янв–Июл», «Мар–Май», «Июль (идёт)» */
  periodLabel: string;
}

export function ChartPeriodSelector({ mode, onModeChange, periodLabel }: ChartPeriodSelectorProps) {
  const pillBase = "inline-flex items-center justify-center rounded-full px-2.5 h-6 text-[11px] font-medium transition-all";
  const activeBtn = `${pillBase} bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] shadow-[0_1px_1px_rgba(0,0,0,0.10)]`;
  const inactiveBtn = `${pillBase} bg-white text-[#1d1d1f] ring-1 ring-black/[0.08] shadow-[0_1px_1px_rgba(0,0,0,0.04)] hover:ring-black/[0.14] hover:shadow-[0_1px_2px_rgba(0,0,0,0.07)]`;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={() => onModeChange("ni")} className={mode === "ni" ? activeBtn : inactiveBtn}>
        НИ
      </button>
      <button onClick={() => onModeChange("month")} className={mode === "month" ? activeBtn : inactiveBtn}>
        Месяц
      </button>
      <span className="text-[11px] text-[#86868b] tabular-nums whitespace-nowrap">{periodLabel}</span>
    </div>
  );
}
