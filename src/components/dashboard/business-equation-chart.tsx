"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LabelList,
} from "recharts";
import { MonthlyKpiData } from "@/types/finance";

interface BusinessEquationChartProps {
  monthly: MonthlyKpiData[];
  periodSelector?: React.ReactNode;
}

interface BarDataPoint {
  name: string;
  deviation: number;
  deviationLabel: number;
  fact: number;
  budget: number;
  isPercent: boolean;
}


const COLOR_NEGATIVE = "hsl(0, 70%, 75%)";    // розовый/salmon
const COLOR_POSITIVE = "hsl(210, 70%, 55%)";   // синий

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as BarDataPoint;
  if (!point) return null;

  const factStr = point.isPercent ? `${Math.round(point.fact)}%` : formatAmount(point.fact);
  const budgetStr = point.isPercent ? `${Math.round(point.budget)}%` : formatAmount(point.budget);

  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid hsl(var(--border))",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{point.name}</p>
      <p>Бюджет: {budgetStr}</p>
      <p>Факт: {factStr}</p>
      <p style={{ color: point.deviationLabel >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE, marginTop: 2 }}>
        Отклонение: {point.deviationLabel}%
      </p>
    </div>
  );
}

export function BusinessEquationChart({ monthly, periodSelector }: BusinessEquationChartProps) {
  const chartData = useMemo<BarDataPoint[]>(() => {
    // Суммируем факт и бюджет за выбранный период
    let factRevenue = 0, budgetRevenue = 0;
    let factMarginPercent = 0, budgetMarginPercent = 0;
    let factMargin = 0, budgetMargin = 0;
    let factFixed = 0, budgetFixed = 0;
    let factProfit = 0, budgetProfit = 0;
    let pastCount = 0;
    let totalRequestsFact = 0, totalRequestsPlan = 0;
    let totalProjectsSoldFact = 0, totalProjectsNotSoldFact = 0;
    let totalProjectsByActs = 0, totalProjectsByActsRevenue = 0;

    for (const m of monthly) {
      // AMO-метрики: доступны для всех месяцев (прошлых + текущий)
      totalRequestsFact += m.requestsFact;
      totalRequestsPlan += m.requestsPlan;
      totalProjectsSoldFact += m.projectsSoldFact;
      totalProjectsNotSoldFact += m.projectsNotSoldFact;

      // Проекты по актам (из projects — STATUS_SOLD + дата акта)
      if (m.projects) {
        totalProjectsByActs += m.projects.length;
        for (const p of m.projects) totalProjectsByActsRevenue += p.price;
      }

      // PlanFact-метрики: только прошлые месяцы
      if (!m.isPast) continue;
      factRevenue += m.revenue;
      budgetRevenue += m.budgetRevenue;
      factMargin += m.margin;
      budgetMargin += m.budgetMargin;
      factFixed += m.fixedExpenses;
      budgetFixed += m.budgetFixedExpenses;
      factProfit += m.factProfit;
      budgetProfit += m.budgetProfit;
      factMarginPercent += m.marginPercent;
      budgetMarginPercent += m.budgetMarginPercent;
      pastCount++;
    }

    // Маржинальность — среднее за период
    const avgFactMarginPct = pastCount > 0 ? factMarginPercent / pastCount : 0;
    const avgBudgetMarginPct = pastCount > 0 ? budgetMarginPercent / pastCount : 0;

    // Средний чек: бюджет = 647 500, факт = выручка / проекты по актам
    const BUDGET_AVG_CHECK = 647500;
    const factAvgCheck = totalProjectsByActs > 0 ? factRevenue / totalProjectsByActs : 0;

    // Конверсия: факт = sold / (sold + notSold), бюджет = 50%
    const totalDecided = totalProjectsSoldFact + totalProjectsNotSoldFact;
    const factConversion = totalDecided > 0 ? (totalProjectsSoldFact / totalDecided) * 100 : 0;
    const budgetConversion = 50;

    // Проекты: факт = по актам, бюджет = budgetRevenue / средний чек
    const budgetProjects = BUDGET_AVG_CHECK > 0 ? budgetRevenue / BUDGET_AVG_CHECK : 0;

    const items: [string, number, number, boolean][] = [
      ["Запросы", totalRequestsFact, totalRequestsPlan, false],
      ["Конверсия", factConversion, budgetConversion, true],
      ["Проекты", totalProjectsByActs, budgetProjects, false],
      ["Средний чек", factAvgCheck, BUDGET_AVG_CHECK, false],
      ["Выручка", factRevenue, budgetRevenue, false],
      ["Маржин-ть", avgFactMarginPct, avgBudgetMarginPct, true],
      ["Маржа", factMargin, budgetMargin, false],
      ["Пост. расходы", factFixed, budgetFixed, false],
      ["Прибыль", factProfit, budgetProfit, false],
    ];

    return items.map(([name, fact, budget, isPercent]) => {
      const dev = computeDeviation(fact, budget);
      return {
        name,
        deviationLabel: dev,
        deviation: Math.max(-100, Math.min(100, dev)),
        fact,
        budget,
        isPercent,
      };
    });
  }, [monthly]);

  return (
    <div className="rounded-xl border-0 bg-card/80 backdrop-blur-sm shadow-sm p-4">
      <h3 className="text-lg font-bold mb-4 text-center">
        &#x2696; Бизнес-уравнение
      </h3>
      {periodSelector && <div className="flex justify-start -mt-3 mb-2">{periodSelector}</div>}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 25, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            interval={0}
            angle={-25}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={55}
            domain={[-120, 120]}
          />
          <ReferenceLine y={0} stroke="#a0a0a0" strokeDasharray="3 3" strokeWidth={2} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="deviation" radius={[4, 4, 0, 0]} barSize={50}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.deviationLabel >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE}
              />
            ))}
            <LabelList
              dataKey="deviationLabel"
              position="top"
              formatter={(v) => `${Number(v) > 0 ? "+" : ""}${v}%`}
              style={{ fontSize: 11, fontWeight: 600 }}
              offset={4}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
