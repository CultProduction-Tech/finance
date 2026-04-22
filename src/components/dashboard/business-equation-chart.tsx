"use client";

import { useMemo } from "react";
import { MonthlyKpiData, LegalEntity } from "@/types/finance";
import { CHART_COLORS } from "@/lib/chart-colors";

interface BusinessEquationChartProps {
  monthly: MonthlyKpiData[];
  periodSelector?: React.ReactNode;
  entity?: LegalEntity;
}

interface BarDataPoint {
  name: string;
  deviation: number;
  deviationLabel: number;
  fact: number;
  budget: number;
  isPercent: boolean;
}


function computeDeviation(fact: number, budget: number): number {
  if (budget === 0) return 0;
  return Math.round(((fact - budget) / Math.abs(budget)) * 100);
}

function formatAmount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} тыс`;
  return `${sign}${Math.round(abs)}`;
}

function formatValue(value: number, isPercent: boolean): string {
  if (isPercent) return `${Math.round(value)}%`;
  return formatAmount(value);
}


export function BusinessEquationChart({ monthly, periodSelector, entity }: BusinessEquationChartProps) {
  const chartData = useMemo<BarDataPoint[]>(() => {
    let factRevenue = 0, budgetRevenue = 0;
    let factMargin = 0, budgetMargin = 0;
    let factFixed = 0, budgetFixed = 0;
    let factProfit = 0, budgetProfit = 0;
    let pastCount = 0;
    let totalRequestsFact = 0, totalRequestsPlan = 0;
    let totalProjectsSoldFact = 0, totalProjectsNotSoldFact = 0;
    let totalProjectsByActs = 0, totalProjectsByActsRevenue = 0;
    let amoProjectsPrice = 0, amoProjectsExpense = 0;

    for (const m of monthly) {

      totalRequestsFact += m.requestsFact;
      totalRequestsPlan += m.requestsPlan;
      totalProjectsSoldFact += m.projectsSoldFact;
      totalProjectsNotSoldFact += m.projectsNotSoldFact;


      if (m.projects) {
        totalProjectsByActs += m.projects.length;
        for (const p of m.projects) {
          totalProjectsByActsRevenue += p.price;
          amoProjectsPrice += p.price;
          amoProjectsExpense += p.expensePlan;
        }
      }


      if (!m.isPast) continue;
      factRevenue += m.revenue;
      budgetRevenue += m.budgetRevenue;
      factMargin += m.margin;
      budgetMargin += m.budgetMargin;
      factFixed += m.fixedExpensesForEquation ?? m.fixedExpenses;
      budgetFixed += m.budgetFixedExpenses;
      factProfit += m.factProfit;
      budgetProfit += m.budgetProfit;
      pastCount++;
    }


    const avgFactMarginPct = amoProjectsPrice > 0
      ? ((amoProjectsPrice - amoProjectsExpense) / amoProjectsPrice) * 100
      : 0;

    const avgBudgetMarginPct = budgetRevenue > 0 ? (budgetMargin / budgetRevenue) * 100 : 0;


    const BUDGET_AVG_CHECK = 647500;
    const factAvgCheck = totalProjectsByActs > 0 ? factRevenue / totalProjectsByActs : 0;


    const totalDecided = totalProjectsSoldFact + totalProjectsNotSoldFact;
    const factConversion = totalDecided > 0 ? (totalProjectsSoldFact / totalDecided) * 100 : 0;
    const budgetConversion = 50;


    const budgetProjects = BUDGET_AVG_CHECK > 0 ? budgetRevenue / BUDGET_AVG_CHECK : 0;


    const items: [string, number, number, boolean, boolean][] = entity === "cult"
      ? [
          ["Выручка", factRevenue, budgetRevenue, false, false],
          ["Маржин-ть", avgFactMarginPct, avgBudgetMarginPct, true, false],
          ["Маржа", factMargin, budgetMargin, false, false],
          ["Постоянные расходы", factFixed, budgetFixed, false, true],
          ["Прибыль", factProfit, budgetProfit, false, false],
        ]
      : [
          ["Запросы", totalRequestsFact, totalRequestsPlan, false, false],
          ["Конверсия", factConversion, budgetConversion, true, false],
          ["Проекты", totalProjectsByActs, budgetProjects, false, false],
          ["Средний чек", factAvgCheck, BUDGET_AVG_CHECK, false, false],
          ["Выручка", factRevenue, budgetRevenue, false, false],
          ["Маржин-ть", avgFactMarginPct, avgBudgetMarginPct, true, false],
          ["Маржа", factMargin, budgetMargin, false, false],
          ["Постоянные расходы", factFixed, budgetFixed, false, true],
          ["Прибыль", factProfit, budgetProfit, false, false],
        ];

    return items.map(([name, fact, budget, isPercent, isExpense]) => {
      const rawDev = computeDeviation(fact, budget);

      const dev = isExpense ? -rawDev : rawDev;
      return {
        name,
        deviationLabel: dev,
        deviation: Math.max(-100, Math.min(100, dev)),
        fact,
        budget,
        isPercent,
      };
    });
  }, [monthly, entity]);

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-bold">&#x2696;&#xFE0F; Бизнес-уравнение</h3>
        {periodSelector}
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))` }}
      >
        {chartData.map((entry) => {
          const isPositive = entry.deviationLabel >= 0;
          const barColor = isPositive ? CHART_COLORS.positive : CHART_COLORS.negative;
          const bgColor = isPositive ? CHART_COLORS.positiveBg : CHART_COLORS.negativeBg;
          const textColor = isPositive ? CHART_COLORS.positive : CHART_COLORS.negative;
          const arrow = entry.deviationLabel > 0 ? "▲" : entry.deviationLabel < 0 ? "▼" : "•";
          // Высота бара 0–100% от половины области. Экстремумы обрезаются с индикатором.
          const clamped = Math.min(Math.abs(entry.deviationLabel), 100);
          const barHeightPct = clamped;
          const isOverflow = Math.abs(entry.deviationLabel) > 100;
          return (
            <div
              key={entry.name}
              className="rounded-xl px-3 pt-3 pb-3 flex flex-col shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_3px_10px_rgba(0,0,0,0.08)] transition-shadow duration-200"
              style={{ background: bgColor }}
            >
              {/* Название */}
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-tight mb-2 min-h-[39px]">
                {entry.name}
              </div>

              {/* Мини-бар от центральной линии */}
              <div className="relative h-12 mb-2">
                {/* Верхняя половина — положительные */}
                <div className="absolute inset-x-0 top-0 bottom-1/2 flex items-end justify-center">
                  {isPositive && entry.deviationLabel !== 0 && (
                    <div
                      className="rounded-t-sm w-[50%] transition-all"
                      style={{ height: `${barHeightPct}%`, background: barColor }}
                    />
                  )}
                </div>
                {/* Центральная линия (0%) */}
                <div className="absolute left-0 right-0 top-1/2 h-px bg-black/20 -translate-y-px" />
                {/* Нижняя половина — отрицательные */}
                <div className="absolute inset-x-0 bottom-0 top-1/2 flex items-start justify-center">
                  {!isPositive && (
                    <div
                      className="rounded-b-sm w-[50%] transition-all"
                      style={{ height: `${barHeightPct}%`, background: barColor }}
                    />
                  )}
                </div>
                {/* Индикатор переполнения */}
                {isOverflow && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 text-[8px] font-bold"
                    style={{ color: textColor, ...(isPositive ? { top: 0 } : { bottom: 0 }) }}
                  >
                    {isPositive ? "▲" : "▼"}
                  </div>
                )}
              </div>

              {/* Факт — основное значение */}
              <div className="text-[16px] font-bold leading-none mb-1.5 tabular-nums">
                {formatValue(entry.fact, entry.isPercent)}
              </div>

              {/* Отклонение + план — стек на две строки */}
              <div className="text-[11px] tabular-nums leading-tight flex flex-col gap-0.5">
                <div className="flex items-center gap-1 font-semibold" style={{ color: textColor }}>
                  <span className="text-[9px]">{arrow}</span>
                  {Math.abs(entry.deviationLabel)}%
                </div>
                <div className="text-muted-foreground text-[10px]">
                  от {formatValue(entry.budget, entry.isPercent)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
