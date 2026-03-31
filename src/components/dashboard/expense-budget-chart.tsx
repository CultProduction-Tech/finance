"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { ExpenseCategoryData, LegalEntity } from "@/types/finance";

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

const COLOR_FACT = "hsl(210, 60%, 65%)";       // мягкий синий
const COLOR_OVERSPEND = "hsl(0, 65%, 75%)";    // розовый
const COLOR_SAVINGS = "hsl(160, 50%, 65%)";    // мятный

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
  // Не рендерим если бар-сегмент имеет нулевую высоту (чтобы не дублировать)
  if (!height || Math.abs(height) < 1) return null;
  const cx = (x ?? viewBox?.x ?? 0) + (width ?? viewBox?.width ?? 0) / 2;
  const cy = (y ?? viewBox?.y ?? 0) - 14;
  const dev = value as number;
  const color = dev > 0 ? COLOR_OVERSPEND : dev < 0 ? COLOR_SAVINGS : "hsl(var(--muted-foreground))";

  return (
    <text x={cx} y={cy} textAnchor="middle" fontSize={11} fontWeight={500} fill={color}>
      {dev > 0 ? "+" : ""}{dev}%
    </text>
  );
}

// Фильтр статей по entity
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
    <div className="rounded-xl border-0 bg-card/80 backdrop-blur-sm shadow-sm p-4">
      <h3 className="text-lg font-bold mb-1 text-center">
        &#x1F4B8; Исполнение бюджета расходов
      </h3>
      <div className="flex items-center justify-between mb-2">
        {periodSelector || <div />}
        <div className="text-right">
          <span className="text-lg font-bold">{formatFull(totalFact)}</span>
          <span className="text-xs text-muted-foreground ml-1">{pctOfRevenue}% от выручки</span>
        </div>
      </div>
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
            tickFormatter={(v) => formatAmount(v)}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
          />
          <Bar dataKey="fact" name="Факт" stackId="a" fill={COLOR_FACT} radius={[0, 0, 0, 0]} />
          <Bar dataKey="overspend" name="Перерасход" stackId="a" fill={COLOR_OVERSPEND} radius={[4, 4, 0, 0]}>
            <LabelList dataKey="deviation" content={<DeviationLabel />} />
          </Bar>
          <Bar dataKey="savings" name="Экономия" stackId="a" fill={COLOR_SAVINGS} radius={[4, 4, 0, 0]}>
            <LabelList dataKey="deviation" content={<DeviationLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
