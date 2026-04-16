"use client";

import { KpiData } from "@/types/finance";
import { formatMoney } from "@/lib/finance-utils";
import { KpiCard } from "./kpi-card";

interface KpiGridProps {
  data: KpiData;
}

export function KpiGrid({ data }: KpiGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <KpiCard
        icon="💰"
        label="Выручка"
        value={formatMoney(data.revenue)}
      />
      <KpiCard
        icon="📊"
        label="Маржа"
        value={formatMoney(data.margin)}
      />
      <KpiCard
        icon="📈"
        label="Марж-ть"
        value={formatMoney(data.marginPercent, "%")}
      />
      <KpiCard
        icon="📉"
        label={data.profit >= 0 ? "Прибыль" : "Убыток"}
        value={formatMoney(Math.abs(data.profit))}
        variant={data.profit >= 0 ? "positive" : "negative"}
      />
      <KpiCard
        icon="🏦"
        label="На счетах"
        value={formatMoney(data.cashOnHand)}
      />
      <KpiCard
        icon="📋"
        label="Проектов"
        value={String(data.projectsCount)}
      />
    </div>
  );
}
