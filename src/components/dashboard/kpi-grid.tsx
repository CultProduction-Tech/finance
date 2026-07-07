"use client";

import { KpiData, LegalEntity } from "@/types/finance";
import { formatMoney } from "@/lib/finance-utils";
import { KpiCard } from "./kpi-card";
import { getHint } from "@/lib/hint-texts";

interface KpiGridProps {
  data: KpiData;
  cashflow3m?: number | null;
  entity: LegalEntity;
}

const SHOW_EXTRA_KPIS = false;

function deviation(fact: number, budget: number): number {
  if (budget === 0) return 0;
  return Math.round(((fact - budget) / Math.abs(budget)) * 100);
}

export function KpiGrid({ data, cashflow3m, entity }: KpiGridProps) {
  // Единая семантика с бизнес-уравнением: и факт, и план — ТОЛЬКО прошедшие
  // месяцы периода. Раньше деньги считались «прогнозом» (факт + план будущих):
  // «НИ Янв–Дек» в виджете давал +2.1 млн прибыли, а в уравнении рядом
  // −2.1 млн факта — одинаковый режим показывал разные цифры и путал всех.
  const past = data.monthly.filter((m) => m.isPast);
  const revenue = past.reduce((s, m) => s + m.revenue, 0);
  const margin = past.reduce((s, m) => s + m.margin, 0);
  const profit = past.reduce((s, m) => s + m.factProfit, 0);
  const budgetRevenue = past.reduce((s, m) => s + m.budgetRevenue, 0);
  const budgetMargin = past.reduce((s, m) => s + m.budgetMargin, 0);
  const budgetProfit = past.reduce((s, m) => s + m.budgetProfit, 0);
  const marginPercent = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
  const budgetMarginPercent = budgetRevenue > 0
    ? Math.round((budgetMargin / budgetRevenue) * 100)
    : 0;

  const requestsFact = past.reduce((s, m) => s + m.requestsFact, 0);
  const requestsPlan = past.reduce((s, m) => s + m.requestsPlan, 0);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <div className="col-span-2 md:col-span-1">
        <KpiCard
          icon="📨"
          label="Запросы"
          value={String(requestsFact)}
          hint={getHint(entity, "eq_requests")}
          comparison={requestsPlan > 0 ? {
            deviationPercent: deviation(requestsFact, requestsPlan),
            budgetLabel: String(requestsPlan),
          } : undefined}
        />
      </div>
      <KpiCard
        icon="🔁"
        label="Выручка"
        value={formatMoney(revenue)}
        hint={getHint(entity, "kpi_revenue")}
        comparison={budgetRevenue > 0 ? {
          deviationPercent: deviation(revenue, budgetRevenue),
          budgetLabel: formatMoney(budgetRevenue),
        } : undefined}
      />
      <KpiCard
        icon="💵"
        label="Маржа"
        value={formatMoney(margin)}
        hint={getHint(entity, "kpi_margin")}
        comparison={budgetMargin > 0 ? {
          deviationPercent: deviation(margin, budgetMargin),
          budgetLabel: formatMoney(budgetMargin),
        } : undefined}
      />
      <KpiCard
        icon="📊"
        label="Маржинальность"
        value={formatMoney(marginPercent, "%")}
        hint={getHint(entity, "kpi_margin_percent")}
        comparison={budgetMarginPercent > 0 ? {
          // Для %-показателя отклонение — в процентных пунктах, не «% от %»
          deviationPercent: marginPercent - budgetMarginPercent,
          unit: " п.п.",
          budgetLabel: formatMoney(budgetMarginPercent, "%"),
        } : undefined}
      />
      <KpiCard
        icon="💰"
        label={profit >= 0 ? "Прибыль" : "Убыток"}
        value={formatMoney(Math.abs(profit))}
        variant={profit >= 0 ? "positive" : "negative"}
        hint={getHint(entity, "kpi_profit")}
        comparison={budgetProfit !== 0 ? {
          // Прибыль знакопеременна — проценты от неё не читаются; показываем разницу в деньгах
          deviationPercent: profit - budgetProfit,
          deltaLabel: formatMoney(Math.abs(profit - budgetProfit)),
          budgetLabel: formatMoney(budgetProfit),
        } : undefined}
      />

      {SHOW_EXTRA_KPIS && (
        <>
          <KpiCard icon="📋" label="Проектов" value={String(data.projectsCount)} />
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
