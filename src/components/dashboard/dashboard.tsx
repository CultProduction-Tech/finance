"use client";

import { useState, useEffect } from "react";
import { LegalEntity, LEGAL_ENTITIES } from "@/types/finance";
import { useKpi } from "@/lib/use-kpi";
import { PeriodSelector } from "./period-selector";
import { EntitySwitcher } from "./entity-switcher";
import { KpiGrid } from "./kpi-grid";
import { ProfitChart } from "./profit-chart";
import { BusinessEquationChart } from "./business-equation-chart";
import { DepartmentChart } from "./department-chart";
import { ExpenseBudgetChart } from "./expense-budget-chart";
import { MarginalityChart } from "./marginality-chart";
import { MonthNotes } from "./month-notes";
import { ChartWithPeriod } from "./chart-with-period";
import { Badge } from "@/components/ui/badge";
import { SERIES_COLORS } from "@/lib/chart-colors";

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
          <KpiGrid data={kpi} />
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
              {(data, _loading, ps) => <MarginalityChart monthly={data.monthly} periodSelector={ps} />}
            </ChartWithPeriod>
            <div className="lg:col-span-2">
              <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi} periodVersion={periodVersion}>
                {(data, _loading, ps) => <BusinessEquationChart monthly={data.monthly} periodSelector={ps} entity={entity} />}
              </ChartWithPeriod>
            </div>
            <div className="lg:col-span-2">
              <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={kpi} periodVersion={periodVersion}>
                {(data, _loading, ps) => <ExpenseBudgetChart expenseCategories={data.expenseCategories} revenue={data.revenue} periodSelector={ps} entity={entity} />}
              </ChartWithPeriod>
            </div>
          </div>

          {/* Третий ряд — работа по отделам (мок-данные, весь год) */}
          <div className="mt-6">
            <h2 className="text-[13px] font-medium text-muted-foreground mb-3 px-1 uppercase tracking-wide">
              Работа по отделам · весь год
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <DepartmentChart
                title="Продажи"
                icon="💼"
                series={[
                  {
                    name: "Контакты с клиентами",
                    data: [45, 52, 48, 61, 58, 67, 72, 68, 75, 82, 79, 88],
                    color: SERIES_COLORS[0],
                  },
                ]}
              />
              <DepartmentChart
                title="Доки"
                icon="📄"
                series={[
                  {
                    name: "Платежки",
                    data: [120, 135, 128, 145, 142, 158, 165, 155, 170, 180, 175, 190],
                    color: SERIES_COLORS[1],
                  },
                  {
                    name: "Комплекты документов",
                    data: [85, 90, 92, 105, 100, 115, 118, 112, 125, 130, 128, 140],
                    color: SERIES_COLORS[2],
                  },
                ]}
              />
              <DepartmentChart
                title="Производство"
                icon="🏭"
                series={[
                  {
                    name: "Запросы",
                    data: [25, 32, 28, 35, 38, 42, 45, 40, 48, 52, 50, 55],
                    color: SERIES_COLORS[3],
                  },
                  {
                    name: "Проданные проекты",
                    data: [8, 10, 9, 12, 11, 14, 15, 13, 16, 18, 17, 19],
                    color: SERIES_COLORS[0],
                  },
                ]}
              />
              <DepartmentChart
                title="Пиар"
                icon="📢"
                series={[
                  {
                    name: "Инстаграм",
                    data: [15000, 18000, 16500, 21000, 19500, 24000, 26000, 23500, 28000, 31000, 29500, 33000],
                    color: SERIES_COLORS[4],
                  },
                  {
                    name: "Телеграм",
                    data: [8000, 9500, 8800, 11000, 10500, 13000, 14500, 13500, 16000, 17500, 16800, 18500],
                    color: SERIES_COLORS[5],
                  },
                ]}
              />
            </div>
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
