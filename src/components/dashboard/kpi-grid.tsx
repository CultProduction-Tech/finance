"use client";

import { useMemo } from "react";
import { KpiData, MonthlyKpiData } from "@/types/finance";
import { BudgetKpiCard } from "./budget-kpi-card";

interface KpiGridProps {
  data: KpiData;
}

interface AggregatedKpi {
  factRevenue: number;
  budgetRevenue: number;
  factMargin: number;
  budgetMargin: number;
  factMarginPercent: number;
  budgetMarginPercent: number;
  factProfit: number;
  budgetProfit: number;
}

function aggregate(monthly: MonthlyKpiData[]): AggregatedKpi {
  let factRevenue = 0, factMargin = 0, factProfit = 0;
  let budgetRevenuePast = 0, budgetMarginPast = 0, budgetProfitPast = 0;
  let budgetRevenueAll = 0, budgetMarginAll = 0, budgetProfitAll = 0;
  let pastCount = 0;

  for (const m of monthly) {
    budgetRevenueAll += m.budgetRevenue;
    budgetMarginAll += m.budgetMargin;
    budgetProfitAll += m.budgetProfit;
    if (m.isPast) {
      factRevenue += m.revenue;
      factMargin += m.margin;
      factProfit += m.factProfit;
      budgetRevenuePast += m.budgetRevenue;
      budgetMarginPast += m.budgetMargin;
      budgetProfitPast += m.budgetProfit;
      pastCount++;
    }
  }

  // Сравниваем «факт за прошедшие месяцы» с «бюджет за те же месяцы».
  // Если прошедших нет — берём бюджет за весь период (для будущего).
  const budgetRevenue = pastCount > 0 ? budgetRevenuePast : budgetRevenueAll;
  const budgetMargin = pastCount > 0 ? budgetMarginPast : budgetMarginAll;
  const budgetProfit = pastCount > 0 ? budgetProfitPast : budgetProfitAll;

  const factMarginPercent = factRevenue > 0
    ? Math.round((factMargin / factRevenue) * 100)
    : 0;
  const budgetMarginPercent = budgetRevenue > 0
    ? Math.round((budgetMargin / budgetRevenue) * 100)
    : 0;

  return {
    factRevenue,
    budgetRevenue,
    factMargin,
    budgetMargin,
    factMarginPercent,
    budgetMarginPercent,
    factProfit,
    budgetProfit,
  };
}

export function KpiGrid({ data }: KpiGridProps) {
  const a = useMemo(() => aggregate(data.monthly), [data.monthly]);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <BudgetKpiCard
        icon="🔁"
        label="Выручка"
        factValue={a.factRevenue}
        budgetValue={a.budgetRevenue}
        goal="more"
      />
      <BudgetKpiCard
        icon="💵"
        label="Маржа"
        factValue={a.factMargin}
        budgetValue={a.budgetMargin}
        goal="more"
      />
      <BudgetKpiCard
        icon="📊"
        label="Маржин-ть"
        factValue={a.factMarginPercent}
        budgetValue={a.budgetMarginPercent}
        isPercent
        goal="more"
      />
      <BudgetKpiCard
        icon="💰"
        label="Прибыль"
        factValue={a.factProfit}
        budgetValue={a.budgetProfit}
        goal="more"
      />

      {/*
        Скрытые виджеты (вернуть в сетку при необходимости).
        Используют data.projectsCount, data.cashOnHand, data.fixedExpenses, data.cashflow3Months.

        <KpiCard icon="📋" label="Проектов" value={String(data.projectsCount)} />
        <KpiCard icon="🏦" label="На счетах" value={formatMoney(data.cashOnHand)} />
        <KpiCard icon="💸" label={"Постоянные\nрасходы"} value={formatMoney(data.fixedExpenses)} />
        <KpiCard icon="🔮" label="Кэшфлоу 3 мес" value={formatMoney(data.cashflow3Months)}
                 variant={data.cashflow3Months >= 0 ? "positive" : "negative"} />
      */}
    </div>
  );
}
