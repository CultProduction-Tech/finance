"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { MonthlyKpiData, MONTHS_RU } from "@/types/finance";

interface ProfitChartProps {
  monthly: MonthlyKpiData[];
}

interface ChartDataPoint {
  month: string;
  label: string;
  factCum: number | null;
  budgetCum: number;
  profitabilityCum: number | null;
  factMonthly: number;
  budgetMonthly: number;
}

const COLOR_BUDGET = "hsl(220, 75%, 55%)";   // синий
const COLOR_FACT = "hsl(145, 60%, 42%)";      // зелёный
const COLOR_PROFITABILITY = "hsl(45, 95%, 50%)"; // жёлтый

function formatValue(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} тыс`;
  return `${sign}${abs}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as ChartDataPoint | undefined;
  if (!point) return null;

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
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: COLOR_BUDGET }}>
        Бюджет НИ: {formatValue(point.budgetCum)}{" "}
        ({formatValue(point.budgetMonthly)})
      </p>
      {point.factCum !== null && (
        <p style={{ color: COLOR_FACT }}>
          Факт НИ: {formatValue(point.factCum)}{" "}
          ({formatValue(point.factMonthly)})
        </p>
      )}
      {point.profitabilityCum !== null && (
        <p style={{ color: COLOR_PROFITABILITY }}>
          Рентабельность: {point.profitabilityCum.toFixed(1)}%
        </p>
      )}
    </div>
  );
}

export function ProfitChart({ monthly }: ProfitChartProps) {
  const chartData = useMemo<ChartDataPoint[]>(() => {
    let cumFact = 0;
    let cumBudget = 0;
    let cumRevenue = 0;

    return monthly.map((m) => {
      // Бюджет НИ: всегда из бюджета
      cumBudget += m.budgetProfit;

      // Факт НИ и рентабельность НИ: только прошлые
      let factCumValue: number | null = null;
      let profitabilityValue: number | null = null;

      if (m.isPast) {
        cumFact += m.factProfit;
        cumRevenue += m.factRevenue;
        factCumValue = cumFact;
        profitabilityValue = cumRevenue !== 0
          ? (cumFact / cumRevenue) * 100
          : 0;
      }

      const monthIndex = parseInt(m.month.split("-")[1], 10) - 1;
      const label = MONTHS_RU[monthIndex]?.substring(0, 3) || m.month;

      return {
        month: m.month,
        label,
        factCum: factCumValue,
        budgetCum: cumBudget,
        profitabilityCum: profitabilityValue,
        factMonthly: m.factProfit,
        budgetMonthly: m.budgetProfit,
      };
    });
  }, [monthly]);

  if (!chartData.length) return null;

  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="text-lg font-bold mb-4 text-center">
        Чистая прибыль и рентабельность
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatValue(v)}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={70}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="budgetCum"
            name="Бюджет НИ"
            stroke={COLOR_BUDGET}
            strokeWidth={2}
            dot={{ r: 3, fill: COLOR_BUDGET }}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="factCum"
            name="Факт НИ"
            stroke={COLOR_FACT}
            strokeWidth={2}
            dot={{ r: 3, fill: COLOR_FACT }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="profitabilityCum"
            name="Рентабельность"
            stroke={COLOR_PROFITABILITY}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: COLOR_PROFITABILITY }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
