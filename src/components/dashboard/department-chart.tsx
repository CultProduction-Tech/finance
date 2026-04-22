"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MONTHS_RU } from "@/types/finance";
import { BarCursor } from "./chart-cursor";

interface DepartmentSeries {
  name: string;
  data: number[];
  color: string;
}

interface DepartmentChartProps {
  title: string;
  icon: string;
  series: DepartmentSeries[];
  /** Суффикс к значениям в тултипе/оси (например, "шт", "охват") */
  unit?: string;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} тыс`;
  return String(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
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
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{formatNumber(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

export function DepartmentChart({ title, icon, series }: DepartmentChartProps) {
  const data = MONTHS_RU.map((m, i) => {
    const row: Record<string, string | number> = { month: m.substring(0, 3) };
    series.forEach((s) => {
      row[s.name] = s.data[i] ?? 0;
    });
    return row;
  });

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-lg font-bold">
          {icon} {title}
        </h3>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 10, right: 5, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={formatNumber}
            className="fill-muted-foreground"
          />
          <Tooltip content={<CustomTooltip />} cursor={<BarCursor />} />
          {series.map((s) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {series.length > 0 && (
        <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] text-muted-foreground">
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
