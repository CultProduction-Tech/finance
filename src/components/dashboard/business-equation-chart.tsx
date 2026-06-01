"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
  LabelList,
  Tooltip,
} from "recharts";
import { MonthlyKpiData, LegalEntity } from "@/types/finance";
import { CHART_COLORS } from "@/lib/chart-colors";
import { BarCursor } from "./chart-cursor";

interface BusinessEquationChartProps {
  monthly: MonthlyKpiData[];
  periodSelector?: React.ReactNode;
  entity?: LegalEntity;
}

interface BarDataPoint {
  name: string;
  /** Отклонение, обрезанное под визуальную шкалу (±120) */
  deviation: number;
  /** Сырое отклонение для подписи и тултипа */
  deviationLabel: number;
  fact: number;
  budget: number;
  isPercent: boolean;
}

const CHART_DOMAIN = 145;
const CHART_TICKS = [-120, -60, 0, 60, 120];
const Y_AXIS_WIDTH = 56;

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

// Кастомный shape: бар + чёрная подпись над/под ним.
// Используем shape вместо LabelList — у LabelList для отрицательных баров
// y/height приходят как для нулевой высоты, и подпись клеится к 0-линии.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarWithLabel(props: any) {
  const { x, y, width, height, fill, payload } = props;
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number") return null;
  const dev: number = payload?.deviationLabel ?? 0;
  const isNeg = dev < 0;
  // Recharts передаёт для отрицательных баров y = нижняя точка, height < 0 (вверх к 0-линии).
  // Для положительных: y = верх бара, height > 0 (вниз к 0-линии).
  // Нормализуем для <rect>: rectY = min(y, y+height), absH = |height|.
  const rectY = Math.min(y, y + height);
  const absH = Math.abs(height);
  const labelY = isNeg ? y + 14 : y - 6;
  const sign = dev > 0 ? "+" : "";
  const radius = 3;
  return (
    <g>
      <rect
        x={x}
        y={rectY}
        width={width}
        height={absH}
        fill={fill}
        rx={radius}
        ry={radius}
      />
      <text
        x={x + width / 2}
        y={labelY}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="#1d1d1f"
      >
        {sign}{dev}%
      </text>
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as BarDataPoint;
  if (!p) return null;
  const devColor = p.deviationLabel > 0
    ? CHART_COLORS.positive
    : p.deviationLabel < 0
      ? CHART_COLORS.negative
      : "#888";
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
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</p>
      <p style={{ color: "#888" }}>Бюджет: {formatValue(p.budget, p.isPercent)}</p>
      <p style={{ fontWeight: 600 }}>Факт: {formatValue(p.fact, p.isPercent)}</p>
      <p style={{ marginTop: 4, color: devColor, fontWeight: 600 }}>
        {p.deviationLabel > 0 ? "+" : ""}{p.deviationLabel}%
      </p>
    </div>
  );
}

export function BusinessEquationChart({ monthly, periodSelector, entity }: BusinessEquationChartProps) {
  const chartData = useMemo<BarDataPoint[]>(() => {
    let factRevenue = 0, budgetRevenue = 0;
    let factMargin = 0, budgetMargin = 0;
    let factFixed = 0, budgetFixed = 0;
    let factProfit = 0, budgetProfit = 0;
    let totalRequestsFact = 0, totalRequestsPlan = 0;
    let totalProjectsSoldFact = 0, totalProjectsNotSoldFact = 0;
    let totalProjectsByActs = 0;
    let totalProjectsPlan = 0;
    let totalWinsFact = 0;
    let amoProjectsPrice = 0, amoProjectsExpense = 0;

    for (const m of monthly) {
      totalRequestsFact += m.requestsFact;
      totalRequestsPlan += m.requestsPlan;
      totalProjectsPlan += m.projectsPlan;
      totalWinsFact += m.winsFact ?? 0;
      totalProjectsSoldFact += m.projectsSoldFact;
      totalProjectsNotSoldFact += m.projectsNotSoldFact;

      if (m.projects) {
        totalProjectsByActs += m.projects.length;
        for (const p of m.projects) {
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
    }

    const avgFactMarginPct = amoProjectsPrice > 0
      ? ((amoProjectsPrice - amoProjectsExpense) / amoProjectsPrice) * 100
      : 0;
    const avgBudgetMarginPct = budgetRevenue > 0 ? (budgetMargin / budgetRevenue) * 100 : 0;

    // Винрейт/конверсия:
    //   Бластер: победы (Продажа + Реализовано) / завершённые (Продажа + Реализовано + Закрыто и не реализовано) × 100%
    //   Культ:   takenToWork / totalRequests × 100%
    // У Бластера используем m.winsFact в числителе и m.projectsSoldFact в знаменателе (он же "обработанные" = 3 финальных статуса).
    const factConversion = entity === "cult"
      ? (totalRequestsFact > 0 ? (totalProjectsSoldFact / totalRequestsFact) * 100 : 0)
      : (totalProjectsSoldFact > 0 ? (totalWinsFact / totalProjectsSoldFact) * 100 : 0);
    const factAvgCheck = totalProjectsByActs > 0 ? factRevenue / totalProjectsByActs : 0;

    let pastCount = 0;
    for (const m of monthly) {
      if (m.isPast) pastCount++;
    }

    // Blaster plan values
    const BLASTER_BUDGET_AVG_CHECK = 900_000;
    const BLASTER_BUDGET_CONVERSION = 30;
    // План проектов — сумма помесячных значений за выбранный период (из m.projectsPlan, PROJECTS_PLAN_2026)
    const blasterBudgetProjects = totalProjectsPlan;

    // Cult plan values
    const CULT_BUDGET_AVG_CHECK = 9_000_000;
    const CULT_BUDGET_CONVERSION = 16;
    const CULT_BUDGET_PROJECTS = pastCount * 2;

    const items: [string, number, number, boolean, boolean][] = entity === "cult"
      ? [
          ["Запросы", totalRequestsFact, totalRequestsPlan, false, false],
          ["Конверсия", factConversion, CULT_BUDGET_CONVERSION, true, false],
          ["Проекты", totalProjectsByActs, CULT_BUDGET_PROJECTS, false, false],
          ["Средний чек", factAvgCheck, CULT_BUDGET_AVG_CHECK, false, false],
          ["Выручка", factRevenue, budgetRevenue, false, false],
          ["Маржин-ть", avgFactMarginPct, avgBudgetMarginPct, true, false],
          ["Маржа", factMargin, budgetMargin, false, false],
          ["Пост. расходы", factFixed, budgetFixed, false, true],
          ["Прибыль", factProfit, budgetProfit, false, false],
        ]
      : [
          ["Запросы", totalRequestsFact, totalRequestsPlan, false, false],
          // Победы — лиды в Продаже+Реализовано по дате создания (отдельный счётчик m.winsFact); план = запросы × 30%
          ["Победы", totalWinsFact, totalRequestsPlan * 0.30, false, false],
          ["Винрейт", factConversion, BLASTER_BUDGET_CONVERSION, true, false],
          ["Проекты по актам", totalProjectsByActs, blasterBudgetProjects, false, false],
          ["Средний чек", factAvgCheck, BLASTER_BUDGET_AVG_CHECK, false, false],
          ["Выручка", factRevenue, budgetRevenue, false, false],
          ["Маржин-ть по проектам", avgFactMarginPct, avgBudgetMarginPct, true, false],
          ["Маржа", factMargin, budgetMargin, false, false],
          ["Пост. расходы", factFixed, budgetFixed, false, true],
          ["Прибыль", factProfit, budgetProfit, false, false],
        ];

    return items.map(([name, fact, budget, isPercent, isExpense]) => {
      const rawDev = computeDeviation(fact, budget);
      const dev = isExpense ? -rawDev : rawDev;
      return {
        name,
        deviationLabel: dev,
        deviation: Math.max(-120, Math.min(120, dev)),
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

      {/* Таблица: Было / Стало */}
      <div
        className="grid items-center mb-1"
        style={{
          gridTemplateColumns: `${Y_AXIS_WIDTH}px repeat(${chartData.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="text-[12px] italic text-muted-foreground text-right pr-2">Бюджет</div>
        {chartData.map((d) => (
          <div
            key={`b-${d.name}`}
            className="text-center text-[13px] text-muted-foreground tabular-nums"
          >
            {formatValue(d.budget, d.isPercent)}
          </div>
        ))}

        <div className="text-[12px] italic font-bold text-right pr-2">Факт</div>
        {chartData.map((d) => (
          <div
            key={`f-${d.name}`}
            className={`text-center text-[13px] font-bold tabular-nums ${
              d.fact < 0 ? "text-[#ff3b30]" : ""
            }`}
          >
            {formatValue(d.fact, d.isPercent)}
          </div>
        ))}
      </div>

      {/* Подложка-разделитель между таблицей и графиком */}
      <div className="h-px bg-black/5 mb-2" />

      {/* График отклонений */}
      <ResponsiveContainer width="100%" height={310}>
        <BarChart
          data={chartData}
          margin={{ top: 22, right: 0, left: 0, bottom: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            angle={-22}
            textAnchor="end"
            height={70}
            interval={0}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            domain={[-CHART_DOMAIN, CHART_DOMAIN]}
            ticks={CHART_TICKS}
            width={Y_AXIS_WIDTH}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={0} stroke="#bbb" strokeDasharray="3 3" />
          <Tooltip content={() => null} cursor={<BarCursor />} />
          <Bar
            dataKey="deviation"
            shape={<BarWithLabel />}
            isAnimationActive={false}
          >
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.deviationLabel > 0
                    ? CHART_COLORS.positive
                    : entry.deviationLabel < 0
                      ? CHART_COLORS.negative
                      : "#bbb"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
