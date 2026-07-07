"use client";

import { useState, useCallback, ReactNode } from "react";
import { KpiData, LegalEntity } from "@/types/finance";
import { useKpi } from "@/lib/use-kpi";
import { todayInBusinessTz } from "@/lib/timezone";
import { ChartPeriodSelector, QuickPeriod } from "./chart-period-selector";
import { ChartCardSkeleton } from "./loading-skeletons";

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

  // Сброс локального периода на любое взаимодействие с верхней панелью.
  // Паттерн «adjust state during render» вместо эффекта: без лишнего кадра
  // со старым локальным периодом и без setState-in-effect.
  const [prevPeriodVersion, setPrevPeriodVersion] = useState(periodVersion);
  if (prevPeriodVersion !== periodVersion) {
    setPrevPeriodVersion(periodVersion);
    setLocalStart(null);
    setLocalEnd(null);
    setActiveQuick(null);
  }

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

  // Месяц для кнопки «Месяц» — по бизнес-TZ (Москва), как весь дашборд,
  // а не по TZ браузера: иначе восточнее Москвы в ночь смены месяца
  // кнопка открывала бы пустой «следующий» месяц.
  const currentMonth = parseInt(todayInBusinessTz().slice(5, 7), 10) - 1;

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

  // Выводим пресет из активного периода, если локальный пресет не задан.
  // "Месяц" подсвечиваем только при явном клике пользователя (activeQuick === "month"),
  // иначе одноразовый период (start === end) визуально читается как промежуток в дропдаунах.
  const derivedQuick: QuickPeriod = activeQuick
    ? activeQuick
    : activeStart === 0 && activeEnd === 11
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
    return <ChartCardSkeleton />;
  }

  return <>{children(kpi, loading, periodSelector)}</>;
}
