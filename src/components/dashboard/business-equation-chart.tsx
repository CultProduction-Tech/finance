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
  projectsCount: number;
}

interface BarDataPoint {
  name: string;
  deviation: number;
  fact: number;
  budget: number;
  isPercent: boolean;
}

const COLOR_NEGATIVE = "hsl(0, 70%, 60%)";    // красный
const COLOR_POSITIVE = "hsl(220, 75%, 55%)";   // синий

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
      <p style={{ color: point.deviation >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE, marginTop: 2 }}>
        Отклонение: {point.deviation}%
      </p>
    </div>
  );
}

export function BusinessEquationChart({ monthly, projectsCount }: BusinessEquationChartProps) {
  const chartData = useMemo<BarDataPoint[]>(() => {
    // Суммируем факт и бюджет за выбранный период
    let factRevenue = 0, budgetRevenue = 0;
    let factMarginPercent = 0, budgetMarginPercent = 0;
    let factMargin = 0, budgetMargin = 0;
    let factFixed = 0, budgetFixed = 0;
    let factProfit = 0, budgetProfit = 0;
    let pastCount = 0;

    for (const m of monthly) {
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

    const factAvgCheck = projectsCount > 0 ? factRevenue / projectsCount : 0;
    const budgetAvgCheck = projectsCount > 0 ? budgetRevenue / projectsCount : 0;

    return [
      { name: "Средний чек", deviation: computeDeviation(factAvgCheck, budgetAvgCheck), fact: factAvgCheck, budget: budgetAvgCheck, isPercent: false },
      { name: "Выручка", deviation: computeDeviation(factRevenue, budgetRevenue), fact: factRevenue, budget: budgetRevenue, isPercent: false },
      { name: "Маржин-ть", deviation: computeDeviation(avgFactMarginPct, avgBudgetMarginPct), fact: avgFactMarginPct, budget: avgBudgetMarginPct, isPercent: true },
      { name: "Маржа", deviation: computeDeviation(factMargin, budgetMargin), fact: factMargin, budget: budgetMargin, isPercent: false },
      { name: "Пост. расходы", deviation: computeDeviation(factFixed, budgetFixed), fact: factFixed, budget: budgetFixed, isPercent: false },
      { name: "Прибыль", deviation: computeDeviation(factProfit, budgetProfit), fact: factProfit, budget: budgetProfit, isPercent: false },
    ];
  }, [monthly, projectsCount]);

  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="text-lg font-bold mb-4 text-center">
        Бизнес-уравнение
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={55}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="deviation" radius={[4, 4, 0, 0]} barSize={60}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.deviation >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE}
              />
            ))}
            <LabelList
              dataKey="deviation"
              position="top"
              formatter={(v) => `${v}%`}
              style={{ fontSize: 12, fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
