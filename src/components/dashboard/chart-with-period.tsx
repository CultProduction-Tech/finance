"use client";

import { useState, useEffect, useRef, ReactNode } from "react";
import { KpiData, LegalEntity } from "@/types/finance";
import { useKpi } from "@/lib/use-kpi";
import { ChartPeriodSelector } from "./chart-period-selector";

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
  const [localYear, setLocalYear] = useState<number | null>(null);
  const [localStart, setLocalStart] = useState<number | null>(null);
  const [localEnd, setLocalEnd] = useState<number | null>(null);

  // Сброс локального периода при смене глобального
  const prevGlobal = useRef({ globalYear, globalStartMonth, globalEndMonth });
  useEffect(() => {
    const prev = prevGlobal.current;
    if (prev.globalYear !== globalYear || prev.globalStartMonth !== globalStartMonth || prev.globalEndMonth !== globalEndMonth) {
      setLocalYear(null);
      setLocalStart(null);
      setLocalEnd(null);
      prevGlobal.current = { globalYear, globalStartMonth, globalEndMonth };
    }
  }, [globalYear, globalStartMonth, globalEndMonth]);

  const hasLocal = localYear !== null && localStart !== null && localEnd !== null;

  const activeYear = hasLocal ? localYear : globalYear;
  const activeStart = hasLocal ? localStart : globalStartMonth;
  const activeEnd = hasLocal ? localEnd : globalEndMonth;

  const needsLocalFetch = hasLocal && (
    localYear !== globalYear || localStart !== globalStartMonth || localEnd !== globalEndMonth
  );

  const { data: localKpi, loading: localLoading } = useKpi({
    entity,
    year: needsLocalFetch ? activeYear : globalYear,
    startMonth: needsLocalFetch ? activeStart : globalStartMonth,
    endMonth: needsLocalFetch ? activeEnd : globalEndMonth,
  });

  const kpi = needsLocalFetch ? localKpi : globalKpi;
  const loading = needsLocalFetch ? localLoading : false;

  const periodSelector = (
    <ChartPeriodSelector
      year={activeYear}
      startMonth={activeStart}
      endMonth={activeEnd}
      onYearChange={(v) => { setLocalYear(v); if (localStart === null) { setLocalStart(globalStartMonth); setLocalEnd(globalEndMonth); } }}
      onStartMonthChange={(v) => { setLocalStart(v); if (localYear === null) { setLocalYear(globalYear); setLocalEnd(globalEndMonth); } }}
      onEndMonthChange={(v) => { setLocalEnd(v); if (localYear === null) { setLocalYear(globalYear); setLocalStart(globalStartMonth); } }}
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
