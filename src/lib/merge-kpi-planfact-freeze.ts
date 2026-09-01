import type { KpiResponse } from "@/app/api/kpi/route";
import type { MonthlyKpi } from "@/app/api/kpi/route";

/** Поля помесячки из PlanFact (деньги + бюджет). Воронка Amo не трогаем. */
const PF_MONTHLY_KEYS = [
  "revenue",
  "variableExpenses",
  "margin",
  "marginPercent",
  "fixedExpenses",
  "fixedExpensesForEquation",
  "profit",
  "factProfit",
  "budgetProfit",
  "factRevenue",
  "budgetRevenue",
  "budgetMargin",
  "budgetMarginPercent",
  "budgetFixedExpenses",
] as const;

/**
 * Живой ответ (свежий Amo) + денежный слой из снимка до платёжного дня.
 * Топ-уровневые денежные агрегаты и expenseCategories — из снимка (тот же период).
 */
export function mergeKpiPlanFactFromSnapshot(
  live: KpiResponse,
  frozen: KpiResponse,
  opts: { planFactAsOf: string },
): KpiResponse {
  const byMonth = new Map(frozen.monthly.map((m) => [m.month, m]));

  const monthly: MonthlyKpi[] = live.monthly.map((lm) => {
    const fm = byMonth.get(lm.month);
    if (!fm) return lm;
    const merged = { ...lm };
    for (const k of PF_MONTHLY_KEYS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[k] = (fm as any)[k];
    }
    return merged;
  });

  return {
    ...live,
    revenue: frozen.revenue,
    expenseBaseRevenue: frozen.expenseBaseRevenue,
    variableExpenses: frozen.variableExpenses,
    margin: frozen.margin,
    marginPercent: frozen.marginPercent,
    fixedExpenses: frozen.fixedExpenses,
    profit: frozen.profit,
    expenseCategories: frozen.expenseCategories,
    budgetLabel: frozen.budgetLabel,
    budgetMeta: frozen.budgetMeta,
    monthly,
    planFactFrozen: true,
    planFactAsOf: opts.planFactAsOf,
    sources: {
      planfact: "frozen",
      amocrm: live.sources?.amocrm ?? "ok",
      ...(live.sources?.budget ? { budget: live.sources.budget } : {}),
    },
  };
}
