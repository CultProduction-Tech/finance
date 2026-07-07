"use client";

import { KpiData, LegalEntity } from "@/types/finance";
import { formatMoney } from "@/lib/finance-utils";
import { KpiCard } from "./kpi-card";
import { getHint } from "@/lib/hint-texts";

interface KpiGridProps {
  data: KpiData;
  cashflow3m?: number | null;
  entity: LegalEntity;
  /** Период включает будущие месяцы: деньги = факт + план будущих (прогноз), помечаем карточки */
  forecast?: boolean;
}

const SHOW_EXTRA_KPIS = false;

function deviation(fact: number, budget: number): number {
  if (budget === 0) return 0;
  return Math.round(((fact - budget) / Math.abs(budget)) * 100);
}

export function KpiGrid({ data, cashflow3m, entity, forecast }: KpiGridProps) {
  // «прогноз» — только на денежных карточках: их значение при периоде с будущими
  // месяцами = факт + план будущих. Запросы прогноза не имеют (факт vs план-к-дате).
  const forecastBadge = forecast ? "прогноз" : undefined;
  const budgetRevenue = data.monthly.reduce((s, m) => s + m.budgetRevenue, 0);
  const budgetMargin = data.monthly.reduce((s, m) => s + m.budgetMargin, 0);
  const budgetProfit = data.monthly.reduce((s, m) => s + m.budgetProfit, 0);
  const budgetMarginPercent = budgetRevenue > 0
    ? Math.round((budgetMargin / budgetRevenue) * 100)
    : 0;

  // Запросы — опережающий индикатор воронки. Факт есть только по прошедшим
  // месяцам, поэтому и план суммируем по ним же (как в бизнес-уравнении) —
  // иначе на многомесячном периоде факт-к-дате сравнивается с планом всего
  // периода и отклонение выглядит катастрофой (−54% вместо честных −17%).
  const requestsFact = data.monthly.reduce((s, m) => s + m.requestsFact, 0);
  const requestsPlan = data.monthly.reduce((s, m) => s + (m.isPast ? m.requestsPlan : 0), 0);

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
        value={formatMoney(data.revenue)}
        badge={forecastBadge}
        hint={getHint(entity, "kpi_revenue")}
        comparison={budgetRevenue > 0 ? {
          deviationPercent: deviation(data.revenue, budgetRevenue),
          budgetLabel: formatMoney(budgetRevenue),
        } : undefined}
      />
      <KpiCard
        icon="💵"
        label="Маржа"
        value={formatMoney(data.margin)}
        badge={forecastBadge}
        hint={getHint(entity, "kpi_margin")}
        comparison={budgetMargin > 0 ? {
          deviationPercent: deviation(data.margin, budgetMargin),
          budgetLabel: formatMoney(budgetMargin),
        } : undefined}
      />
      <KpiCard
        icon="📊"
        label="Маржинальность"
        value={formatMoney(data.marginPercent, "%")}
        badge={forecastBadge}
        hint={getHint(entity, "kpi_margin_percent")}
        comparison={budgetMarginPercent > 0 ? {
          // Для %-показателя отклонение — в процентных пунктах, не «% от %»
          deviationPercent: data.marginPercent - budgetMarginPercent,
          unit: " п.п.",
          budgetLabel: formatMoney(budgetMarginPercent, "%"),
        } : undefined}
      />
      <KpiCard
        icon="💰"
        label={data.profit >= 0 ? "Прибыль" : "Убыток"}
        value={formatMoney(Math.abs(data.profit))}
        badge={forecastBadge}
        variant={data.profit >= 0 ? "positive" : "negative"}
        hint={getHint(entity, "kpi_profit")}
        comparison={budgetProfit !== 0 ? {
          // Прибыль знакопеременна — проценты от неё не читаются; показываем разницу в деньгах
          deviationPercent: data.profit - budgetProfit,
          deltaLabel: formatMoney(Math.abs(data.profit - budgetProfit)),
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
