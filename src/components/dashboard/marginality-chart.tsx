"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LabelList,
} from "recharts";
import { MonthlyKpiData, MONTHS_RU } from "@/types/finance";


interface MarginalityChartProps {
  monthly: MonthlyKpiData[];
  periodSelector?: React.ReactNode;
}

interface BarDataPoint {
  name: string;
  value: number;
  type: "cumulative" | "month" | "project";
  monthKey?: string;
}

const COLOR_CUMULATIVE = "hsl(221, 83%, 53%)";
const COLOR_ABOVE = "hsl(142, 71%, 45%)";
const COLOR_BELOW = "hsl(0, 70%, 75%)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as BarDataPoint;
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
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{point.name}</p>
      <p>Маржинальность: {point.value}%</p>
      {point.type === "month" && <p className="text-xs text-muted-foreground mt-1">Нажмите для детализации</p>}
    </div>
  );
}

export function MarginalityChart({ monthly, periodSelector }: MarginalityChartProps) {
  const [drillMonth, setDrillMonth] = useState<string | null>(null);

  useEffect(() => {
    setDrillMonth(null);
  }, [monthly]);

  const budgetLine = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const m of monthly) {
      if (m.budgetMarginPercent > 0) {
        total += m.budgetMarginPercent;
        count++;
      }
    }
    return count > 0 ? Math.round(total / count) : 0;
  }, [monthly]);

  const calcProjectsMargin = useCallback((projects?: { price: number; expensePlan: number }[]) => {
    if (!projects?.length) return 0;
    let totalPrice = 0;
    let totalExpense = 0;
    for (const p of projects) {
      totalPrice += p.price;
      totalExpense += p.expensePlan;
    }
    return totalPrice > 0
      ? Math.round(((totalPrice - totalExpense) / totalPrice) * 1000) / 10
      : 0;
  }, []);

  const chartData = useMemo(() => {
    const monthsWithProjects = monthly.filter((m) => m.projects?.length);

    let cumPrice = 0;
    let cumExpense = 0;
    for (const m of monthsWithProjects) {
      for (const p of m.projects!) {
        cumPrice += p.price;
        cumExpense += p.expensePlan;
      }
    }
    const cumMarginPercent = cumPrice > 0
      ? Math.round(((cumPrice - cumExpense) / cumPrice) * 1000) / 10
      : 0;

    const data: BarDataPoint[] = [{
      name: "НИ",
      value: cumMarginPercent,
      type: "cumulative",
    }];

    if (drillMonth) {
      const m = monthly.find((m) => m.month === drillMonth);
      if (m?.projects?.length) {
        for (const p of m.projects) {
          data.push({
            name: p.name.length > 15 ? p.name.substring(0, 13) + "…" : p.name,
            value: p.marginPercent,
            type: "project",
          });
        }
      }
    } else if (monthly.length === 1 && monthly[0]?.projects?.length) {
      for (const p of monthly[0].projects) {
        data.push({
          name: p.name.length > 15 ? p.name.substring(0, 13) + "…" : p.name,
          value: p.marginPercent,
          type: "project",
        });
      }
    } else {
      for (const m of monthly) {
        if (!m.projects?.length) continue;
        const monthIndex = parseInt(m.month.split("-")[1], 10) - 1;
        const label = MONTHS_RU[monthIndex]?.substring(0, 3) || m.month;
        data.push({
          name: label,
          value: calcProjectsMargin(m.projects),
          type: "month",
          monthKey: m.month,
        });
      }
    }

    return data;
  }, [monthly, drillMonth, calcProjectsMargin]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick = useCallback((data: any) => {
    if (data?.payload?.type === "month" && data?.payload?.monthKey) {
      setDrillMonth(data.payload.monthKey);
    }
  }, []);

  if (!chartData.length) return null;

  const drillLabel = drillMonth
    ? MONTHS_RU[parseInt(drillMonth.split("-")[1], 10) - 1]
    : null;

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5">
      <h3 className="text-lg font-bold mb-1 text-center">
        &#x1F4CA; Маржинальность{drillLabel ? ` — ${drillLabel}` : ""}
      </h3>
      <div className="flex items-center justify-between mb-2">
        {drillMonth ? (
          <button
            onClick={() => setDrillMonth(null)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Назад
          </button>
        ) : (
          <div />
        )}
        {periodSelector}
      </div>
      <div className="relative">
        {chartData.length > 1 && (
          <div
            className="absolute top-[25px] bottom-[5px] z-10"
            style={{
              width: 2,
              backgroundColor: "#888",
              left: `calc(55px + (100% - 55px - 20px) * ${1 / chartData.length})`,
            }}
          />
        )}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
          onClick={handleBarClick}
          style={{ cursor: chartData.some((d) => d.type === "month") ? "pointer" : "default" }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            interval={0}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={55}
            domain={[0, (max: number) => Math.max(max + 5, budgetLine + 5)]}
          />
          {budgetLine > 0 && (
            <ReferenceLine
              y={budgetLine}
              stroke={COLOR_CUMULATIVE}
              strokeDasharray="6 3"
              strokeWidth={2}
              label={{
                value: `Марж-ть ${budgetLine}%`,
                position: "insideBottomLeft",
                fontSize: 11,
                fill: COLOR_CUMULATIVE,
                offset: 5,
              }}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            barSize={60}
            onClick={handleBarClick}
            style={{ cursor: "pointer" }}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  entry.type === "cumulative"
                    ? COLOR_CUMULATIVE
                    : entry.value >= budgetLine
                      ? COLOR_ABOVE
                      : COLOR_BELOW
                }
              />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v) => `${v}%`}
              style={{ fontSize: 10, fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-5 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_CUMULATIVE }} /> НИ
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_ABOVE }} /> Выше
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_BELOW }} /> Ниже
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: COLOR_CUMULATIVE, width: 14 }} /> Бюджет
        </span>
      </div>
      </div>
    </div>
  );
}
