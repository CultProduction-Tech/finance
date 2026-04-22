"use client";

import { KpiData } from "@/types/finance";
import { formatMoney } from "@/lib/finance-utils";
import { KpiCard } from "./kpi-card";

interface KpiGridProps {
  data: KpiData;
}

export function KpiGrid({ data }: KpiGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {/* Ряд 1: Выручка | Маржа | Проектов | На счетах */}
      <KpiCard
        icon="🔁"
        label="Выручка"
        value={formatMoney(data.revenue)}
      />
      <KpiCard
        icon="📊"
        label="Маржа"
        value={formatMoney(data.margin)}
      />
      <KpiCard
        icon="📋"
        label="Проектов"
        value={String(data.projectsCount)}
      />
      <KpiCard
        icon="🏦"
        label="На счетах"
        value={formatMoney(data.cashOnHand)}
      />
      {/* Ряд 2: Прибыль | Марж-ть | Постоянные расходы | Через 3 мес */}
      <KpiCard
        icon="💰"
        label={data.profit >= 0 ? "Прибыль" : "Убыток"}
        value={formatMoney(Math.abs(data.profit))}
        variant={data.profit >= 0 ? "positive" : "negative"}
      />
      <KpiCard
        icon="📈"
        label="Марж-ть"
        value={formatMoney(data.marginPercent, "%")}
        variant={data.marginPercent >= 44 ? "positive" : "negative"}
      />
      <KpiCard
        icon="💸"
        label={"Постоянные\nрасходы"}
        value={formatMoney(data.fixedExpenses)}
      />
      <KpiCard
        icon="🔮"
        label="Кэшфлоу 3 мес"
        value={formatMoney(data.cashflow3Months)}
        variant={data.cashflow3Months >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}
