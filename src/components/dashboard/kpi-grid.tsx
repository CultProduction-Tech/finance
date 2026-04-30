"use client";

import { KpiData } from "@/types/finance";
import { formatMoney } from "@/lib/finance-utils";
import { KpiCard } from "./kpi-card";

interface KpiGridProps {
  data: KpiData;
  cashflow3m?: number | null;
}

const SHOW_EXTRA_KPIS = false;

function deviation(fact: number, budget: number): number {
  if (budget === 0) return 0;
  return Math.round(((fact - budget) / Math.abs(budget)) * 100);
}

export function KpiGrid({ data, cashflow3m }: KpiGridProps) {
  const budgetRevenue = data.monthly.reduce((s, m) => s + m.budgetRevenue, 0);
  const budgetMargin = data.monthly.reduce((s, m) => s + m.budgetMargin, 0);
  const budgetProfit = data.monthly.reduce((s, m) => s + m.budgetProfit, 0);
  const budgetMarginPercent = budgetRevenue > 0
    ? Math.round((budgetMargin / budgetRevenue) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        icon="🔁"
        label="Выручка"
        value={formatMoney(data.revenue)}
        comparison={budgetRevenue > 0 ? {
          deviationPercent: deviation(data.revenue, budgetRevenue),
          budgetLabel: formatMoney(budgetRevenue),
        } : undefined}
      />
      <KpiCard
        icon="💵"
        label="Маржа"
        value={formatMoney(data.margin)}
        comparison={budgetMargin > 0 ? {
          deviationPercent: deviation(data.margin, budgetMargin),
          budgetLabel: formatMoney(budgetMargin),
        } : undefined}
      />
      <KpiCard
        icon="📊"
        label="Маржинальность"
        value={formatMoney(data.marginPercent, "%")}
        comparison={budgetMarginPercent > 0 ? {
          deviationPercent: deviation(data.marginPercent, budgetMarginPercent),
          budgetLabel: formatMoney(budgetMarginPercent, "%"),
        } : undefined}
      />
      <KpiCard
        icon="💰"
        label={data.profit >= 0 ? "Прибыль" : "Убыток"}
        value={formatMoney(Math.abs(data.profit))}
        variant={data.profit >= 0 ? "positive" : "negative"}
        comparison={budgetProfit !== 0 ? {
          deviationPercent: deviation(data.profit, budgetProfit),
          budgetLabel: formatMoney(budgetProfit),
        } : undefined}
      />

      {SHOW_EXTRA_KPIS && (
        <>
          <KpiCard icon="📋" label="Проектов" value={String(data.projectsCount)} />
          <KpiCard icon="🏦" label="На счетах" value={formatMoney(data.cashOnHand)} />
          {cashflow3m !== null && cashflow3m !== undefined && (
            <KpiCard
              icon="🔮"
              label="Кэшфлоу 3 мес"
              value={formatMoney(cashflow3m)}
              variant={cashflow3m >= 0 ? "positive" : "negative"}
            />
          )}
        </>
      )}
    </div>
  );
}
