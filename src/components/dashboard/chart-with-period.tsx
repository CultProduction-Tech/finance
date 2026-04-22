"use client";

import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { KpiData, LegalEntity } from "@/types/finance";
import { useKpi } from "@/lib/use-kpi";
import { ChartPeriodSelector, QuickPeriod } from "./chart-period-selector";

interface ChartWithPeriodProps {
  entity: LegalEntity;
  globalYear: number;
  globalStartMonth: number;
  globalEndMonth: number;
  globalKpi: KpiData;
  /** Инкрементится на каждое взаимодействие с верхней панелью периода */
  periodVersion: number;
  /** Всегда запрашивать данные с января (для графиков с нарастающим итогом) */
  alwaysFromJanuary?: boolean;
  /** Скрыть кнопку "Месяц" в локальном селекторе */
  hideMonthButton?: boolean;
  children: (kpi: KpiData, loading: boolean, periodSelector: ReactNode) => ReactNode;
}

export function ChartWithPeriod({
  entity,
  globalYear,
  globalStartMonth,
  globalEndMonth,
  globalKpi,
  periodVersion,
  alwaysFromJanuary,
  hideMonthButton,
  children,
}: ChartWithPeriodProps) {
  const [localStart, setLocalStart] = useState<number | null>(null);
  const [localEnd, setLocalEnd] = useState<number | null>(null);
  const [activeQuick, setActiveQuick] = useState<QuickPeriod>(null);

  // Сброс локального периода на любое взаимодействие с верхней панелью
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setLocalStart(null);
    setLocalEnd(null);
    setActiveQuick(null);
  }, [periodVersion]);

  const hasLocal = localStart !== null && localEnd !== null;

  const activeStart = hasLocal ? localStart : globalStartMonth;
  const activeEnd = hasLocal ? localEnd : globalEndMonth;

  const fetchStart = alwaysFromJanuary ? 0 : activeStart;

  const needsLocalFetch = hasLocal && (
    localStart !== globalStartMonth || localEnd !== globalEndMonth
  );
  const needsJanuaryFetch = alwaysFromJanuary && globalStartMonth !== 0;

  const { data: localKpi, loading: localLoading } = useKpi({
    entity,
    year: globalYear,
    startMonth: needsLocalFetch ? fetchStart : (needsJanuaryFetch ? 0 : globalStartMonth),
    endMonth: needsLocalFetch ? activeEnd : globalEndMonth,
  });

  const kpi = (needsLocalFetch || needsJanuaryFetch) ? localKpi : globalKpi;
  const loading = (needsLocalFetch || needsJanuaryFetch) ? localLoading : false;

  const currentMonth = new Date().getMonth();

  const handleQuickPeriod = useCallback((period: QuickPeriod) => {
    if (period === null) {
      // Сброс к глобальному периоду
      setLocalStart(null);
      setLocalEnd(null);
      setActiveQuick(null);
    } else if (period === "month") {
      setLocalStart(currentMonth);
      setLocalEnd(currentMonth);
      setActiveQuick("month");
    } else {
      setLocalStart(0);
      setLocalEnd(11);
      setActiveQuick("year");
    }
  }, [currentMonth]);

  const handleStartChange = useCallback((v: number) => {
    setLocalStart(v);
    setActiveQuick(null);
    if (localEnd === null) setLocalEnd(globalEndMonth);
  }, [localEnd, globalEndMonth]);

  const handleEndChange = useCallback((v: number) => {
    setLocalEnd(v);
    setActiveQuick(null);
    if (localStart === null) setLocalStart(globalStartMonth);
  }, [localStart, globalStartMonth]);

  // Выводим пресет из активного периода, если локальный пресет не задан
  const derivedQuick: QuickPeriod = activeQuick
    ? activeQuick
    : activeStart === activeEnd
      ? "month"
      : activeStart === 0
        ? "year"
        : null;

  const periodSelector = (
    <ChartPeriodSelector
      startMonth={activeStart}
      endMonth={activeEnd}
      activeQuick={derivedQuick}
      onStartMonthChange={handleStartChange}
      onEndMonthChange={handleEndChange}
      onQuickPeriod={handleQuickPeriod}
      hideMonthButton={hideMonthButton}
    />
  );

  if (!kpi) {
    return (
      <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 h-[280px] flex items-center justify-center text-muted-foreground text-sm">
        Загрузка...
      </div>
    );
  }

  return <>{children(kpi, loading, periodSelector)}</>;
}
