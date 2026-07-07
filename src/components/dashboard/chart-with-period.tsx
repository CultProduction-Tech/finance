"use client";

import { useState, ReactNode } from "react";
import { KpiData, LegalEntity, MONTHS_RU } from "@/types/finance";
import { useKpi } from "@/lib/use-kpi";
import { todayInBusinessTz } from "@/lib/timezone";
import { ChartPeriodSelector, ChartMode } from "./chart-period-selector";
import { ChartCardSkeleton } from "./loading-skeletons";

interface ChartWithPeriodProps {
  entity: LegalEntity;
  globalYear: number;
  globalStartMonth: number;
  globalEndMonth: number;
  globalKpi: KpiData;
  /** Инкрементится на каждое взаимодействие с верхней панелью периода */
  periodVersion: number;
  children: (kpi: KpiData, loading: boolean, periodSelector: ReactNode) => ReactNode;
}

const M3 = (i: number) => MONTHS_RU[i]?.substring(0, 3) ?? "";

export function ChartWithPeriod({
  entity,
  globalYear,
  globalStartMonth,
  globalEndMonth,
  globalKpi,
  periodVersion,
  children,
}: ChartWithPeriodProps) {
  // Два представления (ТЗ Кости): «НИ» — период верхней панели (по умолчанию
  // год: факт копится к сегодня), «Месяц» — текущий неполный месяц.
  const [mode, setMode] = useState<ChartMode>("ni");

  // Взаимодействие с верхней панелью возвращает график к «НИ» (adjust-during-render)
  const [prevPeriodVersion, setPrevPeriodVersion] = useState(periodVersion);
  if (prevPeriodVersion !== periodVersion) {
    setPrevPeriodVersion(periodVersion);
    setMode("ni");
  }

  const businessToday = todayInBusinessTz();
  const businessYear = parseInt(businessToday.slice(0, 4), 10);
  const currentMonth = parseInt(businessToday.slice(5, 7), 10) - 1;

  const isMonth = mode === "month";

  // В режиме «НИ» параметры совпадают с глобальным фетчем дашборда —
  // дедуп в use-kpi сводит это к одному сетевому запросу.
  const { data: localKpi, loading: localLoading } = useKpi({
    entity,
    year: isMonth ? businessYear : globalYear,
    startMonth: isMonth ? currentMonth : globalStartMonth,
    endMonth: isMonth ? currentMonth : globalEndMonth,
  });

  const kpi = isMonth ? localKpi : globalKpi;
  const loading = isMonth ? localLoading : false;

  // Подпись периода: всегда видно, какие месяцы на графике.
  // «НИ» на полном текущем годе = «Янв–Июл» (по какой месяц включительно копится факт).
  const isFullYear = globalStartMonth === 0 && globalEndMonth === 11;
  const periodLabel = isMonth
    ? `${MONTHS_RU[currentMonth]} (идёт)`
    : isFullYear && globalYear === businessYear
      ? `Янв–${M3(currentMonth)}`
      : `${M3(globalStartMonth)}–${M3(globalEndMonth)}${globalYear !== businessYear ? ` ${globalYear}` : ""}`;

  const periodSelector = (
    <ChartPeriodSelector mode={mode} onModeChange={setMode} periodLabel={periodLabel} />
  );

  if (!kpi) {
    return <ChartCardSkeleton />;
  }

  return <>{children(kpi, loading, periodSelector)}</>;
}
