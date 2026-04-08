"use client";

import { useState, useEffect } from "react";
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
import { ChartWithPeriod } from "./chart-with-period";
import { Badge } from "@/components/ui/badge";

export function Dashboard() {
  const [entity, setEntity] = useState<LegalEntity>("blaster");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [startMonth, setStartMonth] = useState(0);
  const [endMonth, setEndMonth] = useState(now.getMonth()); // Январь — текущий месяц

  const entityInfo = LEGAL_ENTITIES.find((e) => e.id === entity)!;

  // Применяем тему на <html> чтобы порталы (Select dropdown) тоже её видели
  useEffect(() => {
    const html = document.documentElement;
    if (entity === "cult") {
      html.classList.add("theme-cult");
      html.classList.remove("dashboard-bg-blaster");
    } else {
      html.classList.remove("theme-cult");
    }
    return () => html.classList.remove("theme-cult");
  }, [entity]);

  const { data: kpi, loading, useMock } = useKpi({
    entity,
    year,
    startMonth,
    endMonth,
  });

  // Полный год для кумулятива в графике прибыли
  const { data: fullYearKpi } = useKpi({
    entity,
    year,
    startMonth: 0,
    endMonth: 11,
  });

  return (
    <div className={`min-h-screen ${entity === "cult" ? "theme-cult" : "dashboard-bg-blaster"}`}>
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

      {/* KPI карточки — ограниченная ширина */}
      <div className="max-w-7xl mx-auto px-4 py-4">
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
      </div>

      {/* Графики — широкий контейнер */}
      {kpi && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi}>
              {(data, _loading, ps) => <ProfitChart monthly={data.monthly} periodSelector={ps} fullYearMonthly={fullYearKpi?.monthly} />}
            </ChartWithPeriod>
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi}>
              {(data, _loading, ps) => <BusinessEquationChart monthly={data.monthly} periodSelector={ps} entity={entity} />}
            </ChartWithPeriod>
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi}>
              {(data, _loading, ps) => <MarginalityChart monthly={data.monthly} periodSelector={ps} />}
            </ChartWithPeriod>
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi}>
              {(data, _loading, ps) => <ExpenseBudgetChart expenseCategories={data.expenseCategories} revenue={data.revenue} periodSelector={ps} entity={entity} />}
            </ChartWithPeriod>
          </div>

          {startMonth === endMonth && (
            <div className="mt-4 max-w-7xl mx-auto">
              <MonthNotes entity={entity} year={year} month={startMonth} />
            </div>
          )}
        </div>
      )}

      {/* Переключение юрлиц — внизу */}
      <footer className="sticky bottom-0 bg-card border-t z-50 shadow-lg">
        <div className="max-w-5xl mx-auto px-4">
          <EntitySwitcher selected={entity} onSelect={setEntity} />
        </div>
      </footer>
    </div>
  );
}
