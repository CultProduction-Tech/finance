"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MonthlyKpiData, MONTHS_RU } from "@/types/finance";
import { CHART_COLORS } from "@/lib/chart-colors";

interface ProfitChartProps {
  monthly: MonthlyKpiData[];
  periodSelector?: React.ReactNode;
  fullYearMonthly?: MonthlyKpiData[];
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

const COLOR_BUDGET = CHART_COLORS.positive;
const COLOR_FACT = CHART_COLORS.neutral;
const COLOR_PROFITABILITY = CHART_COLORS.accent;

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

export function ProfitChart({ monthly, periodSelector, fullYearMonthly }: ProfitChartProps) {
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const displayMonths = new Set(monthly.map((m) => m.month));
    const hasAllMonths = fullYearMonthly
      ? monthly.every((m) => fullYearMonthly.some((f) => f.month === m.month))
      : false;
    const source = hasAllMonths ? fullYearMonthly! : monthly;

    let cumFact = 0;
    let cumBudget = 0;
    let cumRevenue = 0;
    const result: ChartDataPoint[] = [];

    for (const m of source) {
      cumBudget += m.budgetProfit;

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

      if (!displayMonths.has(m.month)) continue;

      const monthIndex = parseInt(m.month.split("-")[1], 10) - 1;
      const label = MONTHS_RU[monthIndex]?.substring(0, 3) || m.month;

      result.push({
        month: m.month,
        label,
        factCum: factCumValue,
        budgetCum: cumBudget,
        profitabilityCum: profitabilityValue,
        factMonthly: m.factProfit,
        budgetMonthly: m.budgetProfit,
      });
    }

    return result;
  }, [monthly, fullYearMonthly]);

  if (!chartData.length) {
    return (
      <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5 h-[280px] flex items-center justify-center text-muted-foreground text-sm">
        Нет данных
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-lg font-bold">&#x1F4C8; Чистая прибыль и рентабельность</h3>
        {periodSelector}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatValue(v)}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={75}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={58}
          />
          <Tooltip content={<CustomTooltip />} />
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
      <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_BUDGET }} /> Бюджет НИ
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_FACT }} /> Факт НИ
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block border-t-2 border-dashed" style={{ borderColor: COLOR_PROFITABILITY, width: 14 }} /> Рентабельность
        </span>
      </div>
    </div>
  );
}
