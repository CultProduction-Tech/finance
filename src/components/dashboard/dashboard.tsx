"use client";

import { useState, useEffect } from "react";
import { LegalEntity, LEGAL_ENTITIES, MONTHS_RU } from "@/types/finance";
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
import { CashflowChart } from "./cashflow-chart";
import { KpiCardSkeleton, ChartCardSkeleton } from "./loading-skeletons";
import { Badge } from "@/components/ui/badge";
import { HintModeProvider, useHintMode } from "@/contexts/hint-mode";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { todayInBusinessTz } from "@/lib/timezone";

function HintToggleButton() {
  const { enabled, toggle } = useHintMode();
  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 text-[13px] font-medium transition-colors ${
        enabled ? "text-[var(--accent-solid)]" : "text-muted-foreground hover:text-foreground"
      }`}
      title={enabled ? "Выключить подсказки" : "Включить подсказки (наведи на цифру)"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      Подсказки
    </button>
  );
}

export function Dashboard() {
  return (
    <HintModeProvider>
      <TooltipPrimitive.Provider delay={150}>
        <DashboardInner />
      </TooltipPrimitive.Provider>
    </HintModeProvider>
  );
}

function DashboardInner() {
  const [entity, setEntityState] = useState<LegalEntity>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboard-entity");
      if (saved === "blaster" || saved === "cult") return saved;
    }
    return "blaster";
  });
  const setEntity = (e: LegalEntity) => {
    setEntityState(e);
    localStorage.setItem("dashboard-entity", e);
  };

  // Все «сейчас» — по бизнес-TZ (Москва): единый активный месяц из любого пояса
  const businessToday = todayInBusinessTz(); // "YYYY-MM-DD"
  const [year, setYear] = useState(parseInt(businessToday.slice(0, 4), 10));
  const [startMonth, setStartMonth] = useState(0);
  const [endMonth, setEndMonth] = useState(11); // По умолчанию — весь год
  const [periodVersion, setPeriodVersion] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // KPI-виджеты «Цели месяца» — независимы от общих регуляторов: свой год (текущий) и месяц.
  // Общий период/год не сбрасывают и не меняют этот блок.
  const currentMonth = parseInt(businessToday.slice(5, 7), 10) - 1;
  const kpiYear = parseInt(businessToday.slice(0, 4), 10);
  // День и длина текущего месяца — для подписи «месяц ещё идёт» в блоке целей
  const currentDay = parseInt(businessToday.slice(8, 10), 10);
  const daysInCurrentMonth = new Date(kpiYear, currentMonth + 1, 0).getDate();
  const [kpiLocalStart, setKpiLocalStart] = useState<number | null>(currentMonth);
  const [kpiLocalEnd, setKpiLocalEnd] = useState<number | null>(currentMonth);

  const handleYearChange = (y: number) => {
    setYear(y);
    setPeriodVersion((v) => v + 1);
  };
  const handleStartMonthChange = (m: number) => {
    setStartMonth(m);
    setPeriodVersion((v) => v + 1);
  };
  const handleEndMonthChange = (m: number) => {
    setEndMonth(m);
    setPeriodVersion((v) => v + 1);
  };

  // Активный период для KPI: локальный если задан, иначе глобальный
  const kpiStart = kpiLocalStart ?? startMonth;
  const kpiEnd = kpiLocalEnd ?? endMonth;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Сбрасываем серверный кэш Next.js (PlanFact + AmoCRM), затем триггерим перезапрос всех KPI.
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      // молча — даже если не удалось сбросить, refreshKey всё равно дёрнет повторный фетч
    }
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 1000);
  };

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

  // KPI виджеты — используют свой локальный период
  const { data: kpi, loading, useMock, syncedAt, isStale } = useKpi({
    entity,
    year: kpiYear,
    startMonth: kpiStart,
    endMonth: kpiEnd,
    refreshKey,
  });

  // Графики — используют глобальный период (как стартовая точка)
  const { data: globalKpi } = useKpi({
    entity,
    year,
    startMonth,
    endMonth,
    refreshKey,
  });

  // Полный год для кумулятива в графике прибыли
  const { data: fullYearKpi } = useKpi({
    entity,
    year,
    startMonth: 0,
    endMonth: 11,
    refreshKey,
  });

  // Кэшфлоу 3 мес — последняя точка прогноза
  const [cashflow3m, setCashflow3m] = useState<number | null>(null);

  // Деградация amoCRM в любой из частей (виджет ИЛИ графики): периоды могут
  // отличаться → это разные фетчи, и молчаливые нули в одной части недопустимы.
  let amocrmError: string | null = null;
  if (!useMock) {
    if (kpi?.sources && kpi.sources.amocrm !== "ok") amocrmError = kpi.sources.amocrm;
    else if (globalKpi?.sources && globalKpi.sources.amocrm !== "ok") amocrmError = globalKpi.sources.amocrm;
  }
  // Пропавший в PlanFact бюджет — та же деградация, но для плановых колонок
  const budgetError = !useMock
    ? (kpi?.sources?.budget ?? globalKpi?.sources?.budget ?? null)
    : null;

  return (
    <div className={`min-h-screen ${entity === "cult" ? "theme-cult" : "dashboard-bg-blaster"}`}>
      {/* Шапка */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-black/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Слева (колонка 1fr): логотип + название + иконка источника. min-w-0 — чтобы центр не съезжал при бейджах */}
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- осознанно <a>, не <Link>: полная перезагрузка сбрасывает все фильтры/периоды к базовому виду */}
            <a
              href="/"
              className="flex items-center gap-3 shrink-0 rounded-xl transition-opacity hover:opacity-75"
              title="К исходному виду дашборда"
            >
              <div className="w-10 h-10 rounded-2xl bg-white shrink-0 shadow-sm ring-1 ring-black/5 overflow-hidden flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- крошечный статичный логотип, оптимизация next/image не окупается */}
                <img
                  src={`/logos/${entity}.jpg`}
                  alt={entityInfo.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col leading-tight">
                <h1 className="text-xl font-semibold tracking-tight">{entityInfo.name}</h1>
                {globalKpi?.budgetLabel && (
                  <span className="text-[11px] text-muted-foreground">{globalKpi.budgetLabel}</span>
                )}
              </div>
            </a>
            {/* Ссылка на исходную Google-таблицу текущей компании — сверка данных «в один клик».
                Монохромная иконка таблицы — в языке остальных иконок шапки (16px, muted→foreground). */}
            <a
              href={entityInfo.sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Источник данных — Google-таблица «${entityInfo.name}»`}
              aria-label={`Источник данных — Google-таблица «${entityInfo.name}»`}
              className="flex items-center p-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M3 15h18" />
                <path d="M12 3v18" />
              </svg>
            </a>
            {useMock && (
              <Badge variant="destructive" className="text-xs rounded-full">
                ⚠️ Demo-данные — источники недоступны
              </Badge>
            )}
            {amocrmError && (
              <Badge
                variant="destructive"
                className="text-xs rounded-full"
                title={amocrmError}
              >
                ⚠️ amoCRM недоступен — воронка не загружена
              </Badge>
            )}
            {budgetError && (
              <Badge
                variant="destructive"
                className="text-xs rounded-full"
                title={budgetError}
              >
                ⚠️ Бюджет не найден в PlanFact — план обнулён
              </Badge>
            )}
          </div>

          {/* Центр (auto-колонка): селектор периода — строго по центру страницы благодаря сетке 1fr·auto·1fr */}
          <PeriodSelector
            year={year}
            startMonth={startMonth}
            endMonth={endMonth}
            onYearChange={handleYearChange}
            onStartMonthChange={handleStartMonthChange}
            onEndMonthChange={handleEndMonthChange}
          />

          {/* Справа (колонка 1fr): подсказки + обновить (время в строку) + выйти. justify-end — прижать к правому краю */}
          <div className="flex items-center justify-end gap-4 min-w-0">
            <HintToggleButton />
            {/* «Обновить»; время последнего расчёта — тихим суффиксом в той же строке, на одной базовой линии с соседями */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              Обновить
              {syncedAt && (
                <span
                  className={`ml-0.5 text-[11px] font-normal tabular-nums ${isStale ? "text-amber-600" : "text-muted-foreground/80"}`}
                  title={isStale
                    ? "Показан сохранённый снимок — свежие данные подгружаются из План-факта."
                    : "Время последнего расчёта данных. Нажми «Обновить» для свежей синхронизации из План-факта."}
                >
                  · {isStale ? "снимок " : ""}{syncedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </button>
            <form action="/api/auth/logout" method="POST">
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
        </div>
      </header>

      {/* KPI карточки — ограниченная ширина */}
      <div className="max-w-7xl mx-auto px-6 pt-5 pb-6">
        {loading ? (
          <>
            <div className="flex justify-start mb-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-12 rounded-full animate-pulse bg-black/[0.06]" />
                <div className="h-7 w-24 rounded-full animate-pulse bg-black/[0.06]" />
                <span className="text-[#86868b] text-xs">—</span>
                <div className="h-7 w-24 rounded-full animate-pulse bg-black/[0.06]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <KpiCardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : kpi ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-sm font-semibold text-foreground shrink-0">
                🎯 Цели месяца{kpiStart === kpiEnd ? ` — ${MONTHS_RU[kpiStart]}` : ""}
              </h2>
              <PeriodSelector
                year={kpiYear}
                startMonth={kpiStart}
                endMonth={kpiEnd}
                onYearChange={() => {}}
                onStartMonthChange={(m) => {
                  setKpiLocalStart(m);
                  if (kpiLocalEnd === null) setKpiLocalEnd(endMonth);
                  if (m > kpiEnd) setKpiLocalEnd(m);
                }}
                onEndMonthChange={(m) => {
                  setKpiLocalEnd(m);
                  if (kpiLocalStart === null) setKpiLocalStart(startMonth);
                  if (m < kpiStart) setKpiLocalStart(m);
                }}
                hideYear
              />
            </div>
            {kpiStart <= currentMonth && kpiEnd >= currentMonth && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 ring-1 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20">
                <span className="shrink-0 pt-0.5 text-sm leading-none">⏳</span>
                <span>
                  <b>{MONTHS_RU[currentMonth]} ещё идёт</b> — день {currentDay} из {daysInCurrentMonth}. Факт копится с начала месяца, план дан за весь: нули в начале — норма.
                </span>
              </div>
            )}
            <KpiGrid data={kpi} cashflow3m={cashflow3m} entity={entity} />
          </>
        ) : null}
      </div>

      {/* Графики — скелетоны во время загрузки чтобы layout не прыгал */}
      {!globalKpi && (
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCardSkeleton variant="line" />
            <ChartCardSkeleton variant="bar" />
            <ChartCardSkeleton variant="bar" />
            <ChartCardSkeleton variant="bar" />
          </div>
          <div className="mt-5">
            <ChartCardSkeleton variant="line" height={240} />
          </div>
        </div>
      )}

      {/* Графики — широкий контейнер */}
      {globalKpi && (
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* «Чистая прибыль»: всегда весь год — годовой план виден целиком (ТЗ Кости 07.07) */}
            {fullYearKpi ? (
              <ProfitChart
                monthly={fullYearKpi.monthly}
                entity={entity}
                periodSelector={
                  <span className="text-[11px] text-[#86868b] whitespace-nowrap">
                    план — весь год{year === kpiYear ? ` · факт — по ${MONTHS_RU[currentMonth].substring(0, 3)}` : ""}
                  </span>
                }
              />
            ) : (
              <ChartCardSkeleton variant="line" />
            )}
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={globalKpi} periodVersion={periodVersion}>
              {(data, _loading, ps) => <BusinessEquationChart monthly={data.monthly} periodSelector={ps} entity={entity} projectsWithoutBrief={data.projectsWithoutBrief} />}
            </ChartWithPeriod>
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={globalKpi} periodVersion={periodVersion}>
              {(data, _loading, ps) => <MarginalityChart monthly={data.monthly} periodSelector={ps} entity={entity} projectsWithoutAct={data.projectsWithoutAct} />}
            </ChartWithPeriod>
            <ChartWithPeriod entity={entity} globalYear={year} globalStartMonth={startMonth} globalEndMonth={endMonth} globalKpi={globalKpi} periodVersion={periodVersion}>
              {(data, _loading, ps) => <ExpenseBudgetChart expenseCategories={data.expenseCategories} revenue={data.expenseBaseRevenue ?? data.revenue} periodSelector={ps} entity={entity} />}
            </ChartWithPeriod>
          </div>

          {/* Кэшфлоу — занимает всю ширину под основной 2×2 сеткой */}
          <div className="mt-5">
            <CashflowChart entity={entity} refreshKey={refreshKey} onLastBalance={setCashflow3m} />
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
