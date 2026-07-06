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
  Tooltip,
} from "recharts";
import { MonthlyKpiData, LegalEntity } from "@/types/finance";
import { CHART_COLORS } from "@/lib/chart-colors";
import { BLASTER_PLANS, CULT_PLANS } from "@/lib/plans";
import { BarCursor } from "./chart-cursor";
import { Hint } from "@/components/ui/hint";
import { getHint } from "@/lib/hint-texts";
import { useHintMode } from "@/contexts/hint-mode";

// Маппинг подписи столбика в графике → ключ в hint-texts (берём по entity)
const COLUMN_TO_HINT: Record<string, string> = {
  "Запросы": "eq_requests",
  "Победы": "eq_wins",
  "Винрейт": "eq_winrate",
  "Конверсия": "eq_conversion",
  "Проекты по актам": "eq_projects_by_acts",
  "Проекты": "eq_projects",
  "Средний чек": "eq_avg_check",
  "Выручка": "eq_revenue",
  "Маржин-ть по проектам": "eq_margin_percent",
  "Маржин-ть": "eq_margin_percent",
  "Маржа": "eq_margin",
  "Пост. расходы": "eq_fixed",
  "Прибыль": "eq_profit",
};

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
  /** Если задан — рисуется вместо числа+% (для Прибыли: разница факт−план в деньгах) */
  displayLabel?: string;
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
  const displayLabel: string | undefined = payload?.displayLabel;
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
        {displayLabel ?? `${sign}${dev}%`}
      </text>
    </g>
  );
}

export function BusinessEquationChart({ monthly, periodSelector, entity }: BusinessEquationChartProps) {
  const { enabled: hintMode } = useHintMode();
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
      // Вся воронка (факт И план) — только по прошедшим месяцам, как и финансы ниже.
      // Иначе на годовом периоде факт-к-сегодня сравнивается с планом всего года
      // и отклонения выглядят катастрофой (−56% вместо честных −20%).
      if (!m.isPast) continue;

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

      factRevenue += m.revenue;
      budgetRevenue += m.budgetRevenue;
      factMargin += m.margin;
      budgetMargin += m.budgetMargin;
      factFixed += m.fixedExpensesForEquation ?? m.fixedExpenses;
      budgetFixed += m.budgetFixedExpenses;
      factProfit += m.factProfit;
      budgetProfit += m.budgetProfit;
    }

    // Маржинальность Бластера — теперь как в KPI-карточке: Маржа / Выручка из PlanFact.
    // Культ оставляем по проектам (там используется поле "Маржа" в лиде AmoCRM).
    const avgFactMarginPctCult = amoProjectsPrice > 0
      ? ((amoProjectsPrice - amoProjectsExpense) / amoProjectsPrice) * 100
      : 0;
    const avgFactMarginPctBlaster = factRevenue > 0 ? (factMargin / factRevenue) * 100 : 0;
    const avgFactMarginPct = entity === "cult" ? avgFactMarginPctCult : avgFactMarginPctBlaster;
    const avgBudgetMarginPct = budgetRevenue > 0 ? (budgetMargin / budgetRevenue) * 100 : 0;

    // Винрейт/конверсия:
    //   Бластер: победы (Продажа + Реализовано) / завершённые (Продажа + Реализовано + Закрыто и не реализовано) × 100%
    //   Культ:   takenToWork / totalRequests × 100%
    // У Бластера используем m.winsFact в числителе и m.projectsSoldFact в знаменателе (он же "обработанные" = 3 финальных статуса).
    const factConversion = entity === "cult"
      ? (totalRequestsFact > 0 ? (totalProjectsSoldFact / totalRequestsFact) * 100 : 0)
      : (totalProjectsSoldFact > 0 ? (totalWinsFact / totalProjectsSoldFact) * 100 : 0);
    // «Конверсия запросов в проекты» для Бластера = Победы ÷ Запросы.
    // Добавляется рядом с Винрейтом (аддитивно, Винрейт остаётся).
    const factConversionRate = totalRequestsFact > 0
      ? (totalWinsFact / totalRequestsFact) * 100
      : 0;
    const factAvgCheck = totalProjectsByActs > 0 ? factRevenue / totalProjectsByActs : 0;

    let pastCount = 0;
    for (const m of monthly) {
      if (m.isPast) pastCount++;
    }

    // Планы — из единого модуля lib/plans.ts (хардкод by design, но в одном месте)
    const BLASTER_BUDGET_AVG_CHECK = BLASTER_PLANS.avgCheck;
    const BLASTER_BUDGET_CONVERSION = BLASTER_PLANS.winRatePercent;
    const BLASTER_BUDGET_CONVERSION_RATE = BLASTER_PLANS.conversionPercent;
    // План проектов — сумма помесячных значений за прошедшую часть периода (из m.projectsPlan)
    const blasterBudgetProjects = totalProjectsPlan;

    const CULT_BUDGET_AVG_CHECK = CULT_PLANS.avgCheck;
    const CULT_BUDGET_CONVERSION = CULT_PLANS.conversionPercent;
    const CULT_BUDGET_PROJECTS = pastCount * CULT_PLANS.projectsPerMonth;

    // items: [name, fact, budget, isPercent, isExpense]
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
          // Победы — лиды по дате "Бриф получен" в этапе Реализованo (или created_at для Янв-Мар); план = запросы × 30%
          ["Победы", totalWinsFact, totalRequestsPlan * BLASTER_PLANS.winsShareOfRequests, false, false],
          ["Винрейт", factConversion, BLASTER_BUDGET_CONVERSION, true, false],
          ["Конверсия", factConversionRate, BLASTER_BUDGET_CONVERSION_RATE, true, false],
          ["Проекты по актам", totalProjectsByActs, blasterBudgetProjects, false, false],
          ["Средний чек", factAvgCheck, BLASTER_BUDGET_AVG_CHECK, false, false],
          ["Выручка", factRevenue, budgetRevenue, false, false],
          ["Маржин-ть", avgFactMarginPct, avgBudgetMarginPct, true, false],
          ["Маржа", factMargin, budgetMargin, false, false],
          ["Пост. расходы", factFixed, budgetFixed, false, true],
          ["Прибыль", factProfit, budgetProfit, false, false],
        ];

    return items.map(([name, fact, budget, isPercent, isExpense]) => {
      // Прибыль: бар отражает разницу в деньгах, шкала ±2 млн (мапим на видимую шкалу графика ±120).
      // В подписи и тултипе — фактическая разница факт−план в деньгах (например «−700 тыс»).
      if (name === "Прибыль") {
        const diff = fact - budget;
        const sign = diff > 0 ? "+" : ""; // знак "-" уже встроен в formatAmount
        const PROFIT_SCALE = 2_000_000; // 2 млн = верх/низ шкалы
        const barValue = (diff / PROFIT_SCALE) * 120;
        return {
          name,
          deviationLabel: Math.round(barValue),
          deviation: Math.max(-120, Math.min(120, barValue)),
          fact,
          budget,
          isPercent,
          displayLabel: `${sign}${formatAmount(diff)}`,
        };
      }

      const rawDev = computeDeviation(fact, budget);
      const dev = isExpense ? -rawDev : rawDev;
      return {
        name,
        deviationLabel: Math.round(dev),
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
        {(() => {
          const title = <h3 className="text-lg font-bold">&#x2696;&#xFE0F; Бизнес-уравнение</h3>;
          // Используем title-подсказку первой колонки как общее описание — нет смысла дублировать.
          return title;
        })()}
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
        {chartData.map((d) => {
          const hk = COLUMN_TO_HINT[d.name];
          const h = entity && hk ? getHint(entity, hk) : undefined;
          const cell = (
            <div className="text-center text-[13px] text-muted-foreground tabular-nums">
              {formatValue(d.budget, d.isPercent)}
            </div>
          );
          return h ? (
            <Hint key={`b-${d.name}`} title={h.title} content={h.content} className="block">{cell}</Hint>
          ) : (
            <div key={`b-${d.name}`} className="text-center text-[13px] text-muted-foreground tabular-nums">
              {formatValue(d.budget, d.isPercent)}
            </div>
          );
        })}

        <div className="text-[12px] italic font-bold text-right pr-2">Факт</div>
        {chartData.map((d) => {
          const hk = COLUMN_TO_HINT[d.name];
          const h = entity && hk ? getHint(entity, hk) : undefined;
          const cell = (
            <div className={`text-center text-[13px] font-bold tabular-nums ${d.fact < 0 ? "text-[#ff3b30]" : ""}`}>
              {formatValue(d.fact, d.isPercent)}
            </div>
          );
          return h ? (
            <Hint key={`f-${d.name}`} title={h.title} content={h.content} className="block">{cell}</Hint>
          ) : (
            <div key={`f-${d.name}`} className={`text-center text-[13px] font-bold tabular-nums ${d.fact < 0 ? "text-[#ff3b30]" : ""}`}>
              {formatValue(d.fact, d.isPercent)}
            </div>
          );
        })}
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
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={(props: any) => {
              if (!hintMode || !props.active || !props.payload?.length) return null;
              const p = props.payload[0]?.payload as BarDataPoint;
              if (!p) return null;
              const hk = COLUMN_TO_HINT[p.name];
              if (!hk || !entity) return null;
              const h = getHint(entity, hk);
              if (!h) return null;
              return (
                <div className="max-w-xs rounded-lg bg-white px-3 py-2 text-[12px] leading-snug shadow-lg ring-1 ring-black/10">
                  <div className="font-semibold mb-1 text-[12px]">{h.title}</div>
                  <div className="text-muted-foreground whitespace-pre-line">{h.content}</div>
                </div>
              );
            }}
            cursor={hintMode ? <BarCursor /> : false}
          />
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
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Бары — отклонение факта от плана за прошедшие месяцы периода, %. «Прибыль» — разница в деньгах (шкала ±2 млн).
      </p>
    </div>
  );
}
