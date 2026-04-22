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
  LabelList,
} from "recharts";
import { ExpenseCategoryData, LegalEntity } from "@/types/finance";
import { CHART_COLORS } from "@/lib/chart-colors";
import { BarCursor } from "./chart-cursor";

interface ExpenseBudgetChartProps {
  expenseCategories: ExpenseCategoryData[];
  revenue: number;
  periodSelector?: React.ReactNode;
  entity?: LegalEntity;
}

interface ChartDataPoint {
  name: string;
  fact: number;
  overspend: number;
  savings: number;
  deviation: number;
  budget: number;
  totalFact: number;
}

const COLOR_FACT = CHART_COLORS.positive;
const COLOR_OVERSPEND = CHART_COLORS.negative;
const COLOR_SAVINGS = CHART_COLORS.neutral;

function formatAmount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}М`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}т`;
  return `${sign}${Math.round(abs)}`;
}

function formatFull(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} тыс`;
  return `${sign}${Math.round(abs)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartDataPoint;
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
      <p>Бюджет: {formatFull(point.budget)}</p>
      <p>Факт: {formatFull(point.totalFact)}</p>
      {point.overspend > 0 && (
        <p style={{ color: COLOR_OVERSPEND }}>Перерасход: {formatFull(point.overspend)}</p>
      )}
      {point.savings > 0 && (
        <p style={{ color: COLOR_SAVINGS }}>Экономия: {formatFull(point.savings)}</p>
      )}
      <p style={{ marginTop: 2 }}>
        Отклонение: {point.deviation > 0 ? "+" : ""}{point.deviation}%
      </p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeviationLabel(props: any) {
  const { x, y, width, height, value, viewBox } = props;
  if (!height || Math.abs(height) < 1) return null;
  const cx = (x ?? viewBox?.x ?? 0) + (width ?? viewBox?.width ?? 0) / 2;
  const cy = (y ?? viewBox?.y ?? 0) - 14;
  const dev = value as number;

  return (
    <text x={cx} y={cy} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1d1d1f">
      {dev > 0 ? "+" : ""}{dev}%
    </text>
  );
}

const ALLOWED_NAMES: Record<string, string[]> = {
  blaster: [
    "4. ЗП Бэкофис",
    "2. ЗП Продакшн",
    "1. ЗП Коммерция",
    "3. ЗП КРЕАТИВ",
    "6. ОФИС",
    "8.1. КОМИССИИ",
    "9. НАЛОГИ ФОТ",
    "5. БОНУСЫ НЕ В МАРЖЕ",
    "10. ИНВЕСТИЦИИ, СТРАТЕГИЧЕСКИЕ АКТИВНОСТИ",
    "7. ИМИДЖ И РАЗВИТИЕ",
  ],
  cult: [
    "ЛЮДИ",
    "Налог на прибыль (доходы)",
    "Налоги и комиссии",
    "ФИН. ОПЕРАЦИИ",
    "ТЕНДЕРЫ",
    "Проценты по кредитам и займам",
    "ИМИДЖ",
    "Онлайн сервисы",
    "ОФИС",
    "БОНУСЫ НЕ В МАРЖЕ",
    "БЭКОФИС",
  ],
};

export function ExpenseBudgetChart({ expenseCategories, revenue, periodSelector, entity }: ExpenseBudgetChartProps) {
  const { chartData, totalFact, pctOfRevenue } = useMemo(() => {
    let total = 0;

    const allowed = entity ? ALLOWED_NAMES[entity] : null;
    const filtered = allowed
      ? expenseCategories.filter((c) => allowed.includes(c.name))
      : expenseCategories;

    const data: ChartDataPoint[] = filtered.map((c) => {
      total += c.fact;
      const diff = c.fact - c.budget;
      const deviation = c.budget !== 0 ? Math.round((diff / c.budget) * 100) : 0;

      return {
        name: c.name
          .replace(/^\d+\.\s*/, "")
          .replace("БОНУСЫ НЕ В МАРЖЕ", "Бонусы")
          .replace("ИМИДЖ И РАЗВИТИЕ", "Имидж")
          .replace("ИНВЕСТИЦИИ, СТРАТЕГИЧЕСКИЕ АКТИВНОСТИ", "Инвестиции")
          .replace("НАЛОГИ ФОТ", "Налоги ФОТ")
          .replace("ФИН ОПЕРАЦИИ", "Фин. операции")
          .replace("КОМИССИИ", "Комиссии")
          .replace("ЗАРПЛАТЫ БЭКЛОГ 20-24", "ЗП бэклог")
          .replace("Проценты по кредитам и займам", "% по кредитам"),
        fact: Math.min(c.fact, c.budget),
        overspend: diff > 0 ? diff : 0,
        savings: diff < 0 ? Math.abs(diff) : 0,
        deviation,
        budget: c.budget,
        totalFact: c.fact,
      };
    });

    return {
      chartData: data,
      totalFact: total,
      pctOfRevenue: revenue > 0 ? Math.round((total / revenue) * 100) : 0,
    };
  }, [expenseCategories, revenue, entity]);

  if (!chartData.length) return null;

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-lg font-bold whitespace-nowrap flex items-baseline gap-2">
          <span>&#x1F4B8; Исполнение бюджета расходов</span>
          <span className="text-xl font-bold tabular-nums">{formatFull(totalFact)}</span>
          <span className="text-sm font-medium text-muted-foreground">· {pctOfRevenue}% от выручки</span>
        </h3>
        {periodSelector}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 30, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            interval={0}
            angle={-30}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tickFormatter={(v) => formatAmount(v)}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={60}
          />
          <Tooltip content={<CustomTooltip />} cursor={<BarCursor />} />
          <Bar dataKey="fact" name="Факт" stackId="a" fill={COLOR_FACT} radius={[0, 0, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="overspend" name="Перерасход" stackId="a" fill={COLOR_OVERSPEND} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="deviation" content={<DeviationLabel />} />
          </Bar>
          <Bar dataKey="savings" name="Экономия" stackId="a" fill={COLOR_SAVINGS} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="deviation" content={<DeviationLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_FACT }} /> Факт
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_OVERSPEND }} /> Перерасход
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_SAVINGS }} /> Экономия
        </span>
      </div>
    </div>
  );
}
