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
import { Hint } from "@/components/ui/hint";
import { getHint } from "@/lib/hint-texts";

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
      <p>Факт / план: {formatFull(point.totalFact)}</p>
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
  const cy = (y ?? viewBox?.y ?? 0) - 6;
  const dev = value as number;

  return (
    <text x={cx} y={cy} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1d1d1f">
      {dev > 0 ? "+" : ""}{dev}%
    </text>
  );
}

// Курируемый список статей 1-го уровня для графика. Матчим по id ИЛИ имени:
// id переживает переименование статьи в PlanFact, имя — пересоздание статьи
// с новым id. Тихо выпасть статья может, только если сменились оба сразу
// (раньше матч был только по имени — переименование убирало её молча).
// id сверены с живым PlanFact 07.07.2026.
interface AllowedCategory {
  id: number;
  name: string;
}

const ALLOWED_CATEGORIES: Record<string, AllowedCategory[]> = {
  blaster: [
    { id: 9316221, name: "1. ЗП Коммерция" },
    { id: 9355281, name: "2. ЗП Продакшн" },
    { id: 9355282, name: "3. ЗП КРЕАТИВ" },
    { id: 9355280, name: "4. ЗП Бэкофис" },
    { id: 9355283, name: "5. БОНУСЫ НЕ В МАРЖЕ" },
    { id: 9355284, name: "6. ОФИС" },
    { id: 9355384, name: "7. ИМИДЖ И РАЗВИТИЕ" },
    { id: 9355286, name: "8.1. КОМИССИИ" },
    { id: 9355287, name: "9. НАЛОГИ ФОТ" },
    { id: 9355409, name: "10. ИНВЕСТИЦИИ, СТРАТЕГИЧЕСКИЕ АКТИВНОСТИ" },
  ],
  cult: [
    { id: 9254403, name: "ЛЮДИ" },
    { id: 9254443, name: "Налог на прибыль (доходы)" },
    { id: 9254438, name: "Налоги и комиссии" },
    { id: 9254378, name: "ФИН. ОПЕРАЦИИ" },
    { id: 9254395, name: "ТЕНДЕРЫ" },
    { id: 9254446, name: "Проценты по кредитам и займам" },
    { id: 9254398, name: "ИМИДЖ" },
    { id: 9261293, name: "Онлайн сервисы" },
    { id: 9254427, name: "ОФИС" },
    { id: 9254383, name: "БОНУСЫ НЕ В МАРЖЕ" },
    { id: 9254432, name: "БЭКОФИС" },
  ],
};

export function ExpenseBudgetChart({ expenseCategories, revenue, periodSelector, entity }: ExpenseBudgetChartProps) {
  const { chartData, totalFact, pctOfRevenue, excluded, excludedFact, coveragePct } = useMemo(() => {
    const allowed = entity ? ALLOWED_CATEGORIES[entity] : null;
    const filtered = allowed
      ? expenseCategories.filter((c) => allowed.some((a) => a.id === c.id || a.name === c.name))
      : expenseCategories;

    // Статьи вне курируемого списка: не рисуем барами (например «8. ПРОЕКТЫ» 29.9 млн
    // убил бы шкалу), но показываем строкой под графиком — ничего не исчезает молча.
    // Пересозданная в PlanFact статья (новые id И имя) всплывёт здесь ростом суммы.
    const excludedList = allowed
      ? expenseCategories
          .filter((c) => !allowed.some((a) => a.id === c.id || a.name === c.name))
          .filter((c) => c.fact > 0 || c.budget > 0)
          .sort((a, b) => b.fact - a.fact)
      : [];
    const excludedTotal = excludedList.reduce((sum, c) => sum + c.fact, 0);

    // Итог — отдельным reduce, без мутации переменной внутри map при рендере
    const total = filtered.reduce((sum, c) => sum + c.fact, 0);
    const allFact = total + excludedTotal;

    const data: ChartDataPoint[] = filtered.map((c) => {
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
      excluded: excludedList,
      excludedFact: excludedTotal,
      coveragePct: allFact > 0 ? Math.round((total / allFact) * 100) : 100,
    };
  }, [expenseCategories, revenue, entity]);

  if (!chartData.length) return null;

  const hint = entity ? getHint(entity, "chart_expenses") : undefined;
  const titleEl = (
    <h3 className="text-lg font-bold whitespace-nowrap flex items-baseline gap-2">
      <span>&#x1F4B8; Бюджет расходов</span>
      <span className="text-xl font-bold tabular-nums">{formatFull(totalFact)}</span>
      <span className="text-sm font-medium text-muted-foreground">· {pctOfRevenue}% от выручки</span>
    </h3>
  );

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        {hint ? <Hint title={hint.title} content={hint.content} side="bottom">{titleEl}</Hint> : titleEl}
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
          <Bar dataKey="fact" name="Факт / план" stackId="a" fill={COLOR_FACT} radius={[0, 0, 0, 0]} isAnimationActive={false} />
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
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_FACT }} /> Факт / план
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_OVERSPEND }} /> Перерасход
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_SAVINGS }} /> Экономия
        </span>
      </div>
      {excluded.length > 0 && (
        <div
          className="mt-1.5 text-center text-[11px] text-muted-foreground cursor-help"
          title={`Вне графика:\n${excluded.map((c) => `• ${c.name} — ${formatFull(c.fact)}`).join("\n")}`}
        >
          Список покрывает {coveragePct}% расходов периода · вне графика: {formatFull(excludedFact)} ({excluded.length} стат.) — наведи
        </div>
      )}
    </div>
  );
}
