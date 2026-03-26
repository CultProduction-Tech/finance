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
  children: (kpi: KpiData, loading: boolean, periodSelector: ReactNode) => ReactNode;
}

export function ChartWithPeriod({
  entity,
  globalYear,
  globalStartMonth,
  globalEndMonth,
  globalKpi,
  children,
}: ChartWithPeriodProps) {
  const [localStart, setLocalStart] = useState<number | null>(null);
  const [localEnd, setLocalEnd] = useState<number | null>(null);
  const [activeQuick, setActiveQuick] = useState<QuickPeriod>(null);

  // Сброс локального периода при смене глобального
  const prevGlobal = useRef({ globalYear, globalStartMonth, globalEndMonth });
  useEffect(() => {
    const prev = prevGlobal.current;
    if (prev.globalYear !== globalYear || prev.globalStartMonth !== globalStartMonth || prev.globalEndMonth !== globalEndMonth) {
      setLocalStart(null);
      setLocalEnd(null);
      setActiveQuick(null);
      prevGlobal.current = { globalYear, globalStartMonth, globalEndMonth };
    }
  }, [globalYear, globalStartMonth, globalEndMonth]);

  const hasLocal = localStart !== null && localEnd !== null;

  const activeStart = hasLocal ? localStart : globalStartMonth;
  const activeEnd = hasLocal ? localEnd : globalEndMonth;

  const needsLocalFetch = hasLocal && (
    localStart !== globalStartMonth || localEnd !== globalEndMonth
  );

  const { data: localKpi, loading: localLoading } = useKpi({
    entity,
    year: globalYear,
    startMonth: needsLocalFetch ? activeStart : globalStartMonth,
    endMonth: needsLocalFetch ? activeEnd : globalEndMonth,
  });

  const kpi = needsLocalFetch ? localKpi : globalKpi;
  const loading = needsLocalFetch ? localLoading : false;

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

  const periodSelector = (
    <ChartPeriodSelector
      startMonth={activeStart}
      endMonth={activeEnd}
      activeQuick={activeQuick}
      onStartMonthChange={handleStartChange}
      onEndMonthChange={handleEndChange}
      onQuickPeriod={handleQuickPeriod}
    />
  );

  if (!kpi) {
    return (
      <div className="rounded-xl border-0 bg-card/80 backdrop-blur-sm shadow-sm p-4 h-[280px] flex items-center justify-center text-muted-foreground text-sm">
        Загрузка...
      </div>
    );
  }

  return <>{children(kpi, loading, periodSelector)}</>;
}
