import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import type { HintText } from "@/lib/hint-texts";

interface Comparison {
  deviationPercent: number; // подписанное отклонение факта от бюджета (в unit)
  budgetLabel: string;      // отформатированное значение бюджета (напр. "23.3 млн" или "44%")
  /** Единица отклонения: "%" (по умолчанию) или "п.п." для процентных показателей */
  unit?: string;
  /** Если задан — показывается вместо процентов (напр. денежная разница "−663 тыс") */
  deltaLabel?: string;
}

interface KpiCardProps {
  icon: string;
  label: string;
  value: string;
  subtitle?: string;
  variant?: "default" | "negative" | "positive";
  comparison?: Comparison;
  hint?: HintText;
}

export function KpiCard({ icon, label, value, subtitle, variant = "default", comparison, hint }: KpiCardProps) {
  const card = (
    <div className="group rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">{icon}</span>
        <span className="text-[13px] font-medium text-muted-foreground leading-tight whitespace-pre-line">{label}</span>
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <div
          className={cn(
            "text-lg font-semibold tracking-tight tabular-nums leading-none",
            variant === "negative" && "text-[#ff3b30]",
            variant === "positive" && "text-[#34c759]",
          )}
        >
          {value}
        </div>
        {comparison && (
          <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
            <span
              className={cn(
                "flex items-center gap-0.5 font-medium",
                comparison.deviationPercent < 0 ? "text-[#ff3b30]" : "text-[#34c759]",
              )}
            >
              <span className="text-[9px] leading-none">
                {comparison.deviationPercent < 0 ? "▼" : "▲"}
              </span>
              {comparison.deltaLabel ?? `${Math.abs(comparison.deviationPercent)}${comparison.unit ?? "%"}`}
            </span>
            <span className="text-muted-foreground">из {comparison.budgetLabel}</span>
          </div>
        )}
        {subtitle && !comparison && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );

  if (!hint) return card;
  return (
    <Hint title={hint.title} content={hint.content} className="block w-full">
      {card}
    </Hint>
  );
}
