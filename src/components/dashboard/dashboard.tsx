"use client";

import { useState } from "react";
import { LegalEntity, LEGAL_ENTITIES } from "@/types/finance";
import { useKpi } from "@/lib/use-kpi";
import { PeriodSelector } from "./period-selector";
import { EntitySwitcher } from "./entity-switcher";
import { KpiGrid } from "./kpi-grid";
import { ProfitChart } from "./profit-chart";
import { BusinessEquationChart } from "./business-equation-chart";
import { ExpenseBudgetChart } from "./expense-budget-chart";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export function Dashboard() {
  const [entity, setEntity] = useState<LegalEntity>("blaster");
  const [year, setYear] = useState(2026);
  const [startMonth, setStartMonth] = useState(0);
  const [endMonth, setEndMonth] = useState(2); // Январь — Март

  const entityInfo = LEGAL_ENTITIES.find((e) => e.id === entity)!;

  const { data: kpi, loading, useMock } = useKpi({
    entity,
    year,
    startMonth,
    endMonth,
  });

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Шапка */}
      <header className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{entityInfo.name}</h1>
                <p className="text-sm text-muted-foreground">Финансовый дашборд</p>
              </div>
              {useMock && (
                <Badge variant="secondary" className="text-xs">
                  Demo-данные
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <PeriodSelector
                year={year}
                startMonth={startMonth}
                endMonth={endMonth}
                onYearChange={setYear}
                onStartMonthChange={setStartMonth}
                onEndMonthChange={setEndMonth}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Переключение юрлиц */}
      <div className="max-w-7xl mx-auto px-4 pt-4 sm:px-6 lg:px-8">
        <EntitySwitcher selected={entity} onSelect={setEntity} />
      </div>

      <Separator className="max-w-7xl mx-auto mt-4" />

      {/* KPI карточки */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[100px] rounded-xl border bg-card animate-pulse"
              />
            ))}
          </div>
        ) : kpi ? (
          <KpiGrid data={kpi} />
        ) : null}

        {/* Placeholder для графиков (фаза 3) */}
        <div className="mt-8 grid gap-6">
          {kpi && <ProfitChart monthly={kpi.monthly} />}
          {kpi && <BusinessEquationChart monthly={kpi.monthly} projectsCount={kpi.projectsCount} />}
          <div className="rounded-xl border bg-card p-6 h-[300px] flex items-center justify-center text-muted-foreground">
            Маржинальность
          </div>
          {kpi && <ExpenseBudgetChart expenseCategories={kpi.expenseCategories} revenue={kpi.revenue} />}
        </div>
      </main>
    </div>
  );
}
