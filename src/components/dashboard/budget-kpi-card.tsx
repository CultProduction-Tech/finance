import { cn } from "@/lib/utils";

interface BudgetKpiCardProps {
  icon: string;
  label: string;
  /** Факт (текущее значение) */
  factValue: number;
  /** План/Бюджет за тот же период */
  budgetValue: number;
  /** Значение в процентах (для маржинальности и т.п.) */
  isPercent?: boolean;
  /**
   * Цель — что считается «лучше плана»:
   * - "more": факт ≥ бюджет хорошо (выручка, маржа, прибыль)
   * - "less": факт ≤ бюджет хорошо (расходы)
   */
  goal?: "more" | "less";
}

function formatAmount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} тыс`;
  return `${sign}${Math.round(abs)}`;
}

function formatValue(value: number, isPercent?: boolean): string {
  if (isPercent) return `${Math.round(value)}%`;
  return formatAmount(value);
}

export function BudgetKpiCard({
  icon,
  label,
  factValue,
  budgetValue,
  isPercent,
  goal = "more",
}: BudgetKpiCardProps) {
  const dev = budgetValue !== 0
    ? Math.round(((factValue - budgetValue) / Math.abs(budgetValue)) * 100)
    : 0;
  const isGood = goal === "more" ? dev >= 0 : dev <= 0;
  const arrow = dev > 0 ? "▲" : dev < 0 ? "▼" : "•";

  const colorClass = dev === 0
    ? "text-muted-foreground"
    : isGood
      ? "text-[#34c759]"
      : "text-[#ff3b30]";

  const factColorClass = factValue < 0 ? "text-[#ff3b30]" : "text-foreground";

  return (
    <div className="group rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">{icon}</span>
        <span className="text-[13px] font-medium text-muted-foreground leading-tight truncate">
          {label}
        </span>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <div className={cn("text-lg font-semibold tracking-tight tabular-nums leading-none", factColorClass)}>
          {formatValue(factValue, isPercent)}
        </div>
        <div className={cn("text-[11px] font-semibold tabular-nums flex items-center gap-1 leading-none", colorClass)}>
          <span className="text-[9px]">{arrow}</span>
          <span>{Math.abs(dev)}%</span>
          <span className="text-muted-foreground font-normal">
            из {formatValue(budgetValue, isPercent)}
          </span>
        </div>
      </div>
    </div>
  );
}
