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
  /** Верхняя панель: год = текущий, Янв–Дек (пресет «НИ») */
  globalFullYear: boolean;
  children: (kpi: KpiData, loading: boolean, periodSelector: ReactNode, chartMode: ChartMode) => ReactNode;
}

const M3 = (i: number) => MONTHS_RU[i]?.substring(0, 3) ?? "";

export function ChartWithPeriod({
  entity,
  globalYear,
  globalStartMonth,
  globalEndMonth,
  globalKpi,
  periodVersion,
  globalFullYear,
  children,
}: ChartWithPeriodProps) {
  const businessToday = todayInBusinessTz();
  const businessYear = parseInt(businessToday.slice(0, 4), 10);
  const currentMonth = parseInt(businessToday.slice(5, 7), 10) - 1;

  // «НИ» / «Месяц»; выбранный месяц — только этот график, не в URL/localStorage.
  const [mode, setMode] = useState<ChartMode>("ni");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // Смена глобального периода → снова «НИ» и текущий месяц
  const [prevPeriodVersion, setPrevPeriodVersion] = useState(periodVersion);
  if (prevPeriodVersion !== periodVersion) {
    setPrevPeriodVersion(periodVersion);
    setMode("ni");
    setSelectedMonth(currentMonth);
  }

  const isMonth = mode === "month";

  // В режиме «НИ» параметры совпадают с глобальным фетчем дашборда —
  // дедуп в use-kpi сводит это к одному сетевому запросу.
  const { data: localKpi, loading: localLoading } = useKpi({
    entity,
    year: isMonth ? businessYear : globalYear,
    startMonth: isMonth ? selectedMonth : globalStartMonth,
    endMonth: isMonth ? selectedMonth : globalEndMonth,
  });

  const kpi = isMonth ? localKpi : globalKpi;
  const loading = isMonth ? localLoading : false;

  // Подпись «НИ»: какие месяцы на графике.
  const isFullYear = globalStartMonth === 0 && globalEndMonth === 11;
  const periodLabel = isFullYear && globalYear === businessYear
    ? `Янв–${M3(currentMonth)}`
    : `${M3(globalStartMonth)}–${M3(globalEndMonth)}${globalYear !== businessYear ? ` ${globalYear}` : ""}`;

  const periodSelector = (
    <ChartPeriodSelector
      mode={mode}
      onModeChange={setMode}
      periodLabel={periodLabel}
      selectedMonth={selectedMonth}
      onSelectedMonthChange={(m) => {
        setSelectedMonth(m);
        setMode("month");
      }}
      currentMonth={currentMonth}
    />
  );

  if (!kpi) {
    return <ChartCardSkeleton />;
  }

  return <>{children(kpi, loading, periodSelector, mode)}</>;
}
