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
import { MarginalityChart } from "./marginality-chart";
import { MonthNotes } from "./month-notes";
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
    <div className="min-h-screen dashboard-bg-blaster">
      {/* Шапка */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">✏️</span>
              <h1 className="text-xl font-bold tracking-tight uppercase">{entityInfo.name}</h1>
              {useMock && (
                <Badge variant="secondary" className="text-xs">
                  Demo-данные
                </Badge>
              )}
            </div>
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
      </header>

      {/* KPI карточки */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[90px] rounded-xl bg-card/80 animate-pulse"
              />
            ))}
          </div>
        ) : kpi ? (
          <KpiGrid data={kpi} />
        ) : null}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {kpi && <ProfitChart monthly={kpi.monthly} />}
          {kpi && <BusinessEquationChart monthly={kpi.monthly} />}
          {kpi && <MarginalityChart monthly={kpi.monthly} />}
          {kpi && <ExpenseBudgetChart expenseCategories={kpi.expenseCategories} revenue={kpi.revenue} />}
        </div>

        {startMonth === endMonth && (
          <div className="mt-4">
            <MonthNotes entity={entity} year={year} month={startMonth} />
          </div>
        )}
      </main>

      {/* Переключение юрлиц — внизу */}
      <footer className="sticky bottom-0 bg-card border-t z-50 shadow-lg">
        <div className="max-w-5xl mx-auto px-4">
          <EntitySwitcher selected={entity} onSelect={setEntity} />
        </div>
      </footer>
    </div>
  );
}
