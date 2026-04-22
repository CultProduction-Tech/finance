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
  const [endMonth, setEndMonth] = useState(11); // По умолчанию — весь год
  const [periodVersion, setPeriodVersion] = useState(0);

  const handleYearChange = (y: number) => { setYear(y); setPeriodVersion((v) => v + 1); };
  const handleStartMonthChange = (m: number) => { setStartMonth(m); setPeriodVersion((v) => v + 1); };
  const handleEndMonthChange = (m: number) => { setEndMonth(m); setPeriodVersion((v) => v + 1); };

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

  // Прогноз баланса через 3 месяца: текущие средства + среднее факт-прибыли за последние 3 факт-месяца × 3
  const balanceIn3Months = (() => {
    if (!fullYearKpi) return 0;
    const past = fullYearKpi.monthly.filter((m) => m.isPast);
    const last3 = past.slice(-3);
    if (last3.length === 0) return fullYearKpi.cashOnHand;
    const avgProfit = last3.reduce((s, m) => s + m.factProfit, 0) / last3.length;
    return fullYearKpi.cashOnHand + avgProfit * 3;
  })();

  return (
    <div className={`min-h-screen ${entity === "cult" ? "theme-cult" : "dashboard-bg-blaster"}`}>
      {/* Шапка */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-black/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          {/* Слева: логотип + название */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-white shrink-0 shadow-sm ring-1 ring-black/5 overflow-hidden flex items-center justify-center">
              <img
                src={`/logos/${entity}.jpg`}
                alt={entityInfo.name}
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{entityInfo.name}</h1>
            {useMock && (
              <Badge variant="secondary" className="text-xs rounded-full">
                Demo-данные
              </Badge>
            )}
          </div>

          {/* Центр: селектор периода */}
          <div className="flex-1 flex justify-center">
            <PeriodSelector
              year={year}
              startMonth={startMonth}
              endMonth={endMonth}
              onYearChange={handleYearChange}
              onStartMonthChange={handleStartMonthChange}
              onEndMonthChange={handleEndMonthChange}
            />
          </div>

          {/* Справа: выйти */}
          <form action="/api/auth/logout" method="POST" className="shrink-0">
            <button
              type="submit"
              className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Выйти
            </button>
          </form>
        </div>
      </header>

      {/* KPI карточки — ограниченная ширина */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[52px] rounded-2xl bg-white/60 animate-pulse"
              />
            ))}
          </div>
        ) : kpi ? (
          <KpiGrid data={kpi} balanceIn3Months={balanceIn3Months} />
        ) : null}
      </div>

      {/* Графики — широкий контейнер */}
      {kpi && (
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi} periodVersion={periodVersion} hideMonthButton>
              {(data, _loading, ps) => <ProfitChart monthly={data.monthly} periodSelector={ps} fullYearMonthly={fullYearKpi?.monthly} />}
            </ChartWithPeriod>
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi} periodVersion={periodVersion}>
              {(data, _loading, ps) => <BusinessEquationChart monthly={data.monthly} periodSelector={ps} entity={entity} />}
            </ChartWithPeriod>
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi} periodVersion={periodVersion}>
              {(data, _loading, ps) => <MarginalityChart monthly={data.monthly} periodSelector={ps} />}
            </ChartWithPeriod>
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi} periodVersion={periodVersion}>
              {(data, _loading, ps) => <ExpenseBudgetChart expenseCategories={data.expenseCategories} revenue={data.revenue} periodSelector={ps} entity={entity} />}
            </ChartWithPeriod>
          </div>

          {/* Третий ряд — графики по отделам (заглушка) */}
          <div className="mt-5 rounded-2xl bg-white/70 ring-1 ring-black/5 border border-dashed border-black/10 p-8 min-h-[200px] flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground/70">
                <path d="M3 20h18M5 20V10m4 10V4m4 16V8m4 12v-6m4 6v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="text-[15px] font-semibold mb-1">Графики по отделам</h3>
            <p className="text-[13px] text-muted-foreground">Скоро — данные по отделам подключаются</p>
          </div>

          {startMonth === endMonth && (
            <div className="mt-4 max-w-7xl mx-auto">
              <MonthNotes entity={entity} year={year} month={startMonth} />
            </div>
          )}
        </div>
      )}

      {/* Переключение юрлиц — внизу */}
      <footer className="sticky bottom-0 bg-white/80 backdrop-blur-xl border-t border-black/5 z-50">
        <div className="max-w-5xl mx-auto px-6">
          <EntitySwitcher selected={entity} onSelect={setEntity} />
        </div>
      </footer>
    </div>
  );
}
