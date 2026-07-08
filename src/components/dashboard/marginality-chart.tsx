"use client";

import { useMemo, useState, useCallback } from "react";
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
import { LegalEntity, MonthlyKpiData, MONTHS_RU } from "@/types/finance";
import { CHART_COLORS } from "@/lib/chart-colors";
import { BLASTER_PLANS, CULT_PLANS } from "@/lib/plans";
import { BarCursor } from "./chart-cursor";
import { Hint } from "@/components/ui/hint";
import { getHint } from "@/lib/hint-texts";


interface MarginalityChartProps {
  monthly: MonthlyKpiData[];
  periodSelector?: React.ReactNode;
  entity?: LegalEntity;
  /** Култ: сделки периода без «Даты акта» — их нет на графике, бейдж подсвечивает дыру в данных */
  projectsWithoutAct?: { id: number; name: string }[];
}

// Русская плюрализация: 1 сделка / 2 сделки / 5 сделок
function dealsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "сделка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "сделки";
  return "сделок";
}

interface BarDataPoint {
  name: string;
  value: number;
  type: "cumulative" | "month" | "project";
  monthKey?: string;
}

const COLOR_CUMULATIVE = CHART_COLORS.positive;
const COLOR_ABOVE = CHART_COLORS.neutral;
const COLOR_BELOW = CHART_COLORS.negative;

// Плашка-бейдж для подписи на ReferenceLine. HTML-чип внутри foreignObject
// (а не svg rect+text): на него можно повесить полноценный тултип с объяснением,
// откуда берётся норма — svg-текст такого наведения не даёт.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BudgetBadge(props: any) {
  const { viewBox, value, tipTitle, tipContent } = props;
  if (!viewBox) return null;
  const padX = 7;
  const approxWidth = String(value).length * 6.5 + padX * 2;
  // Максимально вправо — правый край бейджа совпадает с правым краем plot area
  const x = viewBox.x + viewBox.width - approxWidth;
  const y = viewBox.y - 10;
  return (
    <foreignObject x={x} y={y} width={approxWidth} height={22} style={{ overflow: "visible" }}>
      <Hint always side="top" title={tipTitle} content={tipContent} className="block h-full w-full">
        <span
          className="flex h-[20px] w-full items-center justify-center rounded-full bg-white text-[11px] font-bold whitespace-nowrap cursor-help"
          style={{ border: `1.5px solid ${CHART_COLORS.positive}`, color: CHART_COLORS.positive }}
        >
          {value}
        </span>
      </Hint>
    </foreignObject>
  );
}

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

export function MarginalityChart({ monthly, periodSelector, entity, projectsWithoutAct }: MarginalityChartProps) {
  const hint = entity ? getHint(entity, "chart_marginality") : undefined;
  const [drillMonth, setDrillMonth] = useState<string | null>(null);

  // Сброс детализации при смене данных (периода) — adjust-during-render вместо эффекта
  const [prevMonthly, setPrevMonthly] = useState(monthly);
  if (prevMonthly !== monthly) {
    setPrevMonthly(monthly);
    setDrillMonth(null);
  }

  // Норма 2026 — управленческий таргет, принятый командой (plans.ts), а НЕ расчёт
  // из бюджета: раньше пунктир был средним помесячных планов и «дышал» с периодом
  // (год 19%, июнь 22% у Култа). Бюджетная Маржин-ть уравнения — отдельная величина.
  const budgetLine = entity
    ? (entity === "cult" ? CULT_PLANS.marginNormPercent : BLASTER_PLANS.marginNormPercent)
    : 0;

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
    // Для маржинальности проекты отбакетены отдельно (Культ — по «Бриф получен»). Если такого набора нет — fallback на m.projects (Бластер — по «Дате акта»).
    const projsOf = (m: typeof monthly[number]) => m.marginalityProjects ?? m.projects;

    const monthsWithProjects = monthly.filter((m) => projsOf(m)?.length);
    const hasProjects = monthsWithProjects.length > 0;

    // Кумулятивная маржинальность: из проектов (AmoCRM) если есть, иначе — из P&L
    let cumMarginPercent = 0;
    if (hasProjects) {
      let cumPrice = 0;
      let cumExpense = 0;
      for (const m of monthsWithProjects) {
        for (const p of projsOf(m)!) {
          cumPrice += p.price;
          cumExpense += p.expensePlan;
        }
      }
      cumMarginPercent = cumPrice > 0
        ? Math.round(((cumPrice - cumExpense) / cumPrice) * 1000) / 10
        : 0;
    } else {
      let cumRevenue = 0;
      let cumMargin = 0;
      for (const m of monthly) {
        if (!m.isPast) continue;
        cumRevenue += m.revenue;
        cumMargin += m.margin;
      }
      cumMarginPercent = cumRevenue > 0
        ? Math.round((cumMargin / cumRevenue) * 1000) / 10
        : 0;
    }

    const data: BarDataPoint[] = [{
      name: "НИ",
      value: cumMarginPercent,
      type: "cumulative",
    }];

    if (drillMonth) {
      const m = monthly.find((m) => m.month === drillMonth);
      const projs = m ? projsOf(m) : undefined;
      if (projs?.length) {
        for (const p of projs) {
          data.push({
            name: p.name,
            value: p.marginPercent,
            type: "project",
          });
        }
      }
    } else if (monthly.length === 1 && projsOf(monthly[0])?.length) {
      for (const p of projsOf(monthly[0])!) {
        data.push({
          name: p.name,
          value: p.marginPercent,
          type: "project",
        });
      }
    } else if (hasProjects) {
      // Помесячно из проектов
      for (const m of monthly) {
        const projs = projsOf(m);
        if (!projs?.length) continue;
        const monthIndex = parseInt(m.month.split("-")[1], 10) - 1;
        const label = MONTHS_RU[monthIndex]?.substring(0, 3) || m.month;
        data.push({
          name: label,
          value: calcProjectsMargin(projs),
          type: "month",
          monthKey: m.month,
        });
      }
    } else {
      // Помесячно из P&L (Культ и подобные — нет проектной детализации)
      for (const m of monthly) {
        if (!m.isPast) continue;
        const monthIndex = parseInt(m.month.split("-")[1], 10) - 1;
        const label = MONTHS_RU[monthIndex]?.substring(0, 3) || m.month;
        data.push({
          name: label,
          value: m.marginPercent,
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
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {hint ? (
            <Hint title={hint.title} content={hint.content} side="bottom">
              <h3 className="text-lg font-bold whitespace-nowrap">
                &#x1F4CA; Маржинальность{drillLabel ? ` — ${drillLabel}` : ""}
              </h3>
            </Hint>
          ) : (
            <h3 className="text-lg font-bold whitespace-nowrap">
              &#x1F4CA; Маржинальность{drillLabel ? ` — ${drillLabel}` : ""}
            </h3>
          )}
          {!!projectsWithoutAct?.length && (
            <Hint
              always
              side="bottom"
              title="Пустое поле «Дата акта» в amoCRM"
              content={`На график не попадают:\n${projectsWithoutAct.map((p) => `• ${p.name}`).join("\n")}\nЗаполни дату в сделке — она появится в месяце акта.`}
            >
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 h-6 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200/70 whitespace-nowrap cursor-help">
                ⚠️ {projectsWithoutAct.length} {dealsWord(projectsWithoutAct.length)} без даты акта
              </span>
            </Hint>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {drillMonth && (
            <button
              onClick={() => setDrillMonth(null)}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 h-6 text-[11px] font-medium text-[#1d1d1f] ring-1 ring-black/[0.08] shadow-[0_1px_1px_rgba(0,0,0,0.04)] hover:ring-black/[0.14] hover:shadow-[0_1px_2px_rgba(0,0,0,0.07)] transition-all"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Назад
            </button>
          )}
          {periodSelector}
        </div>
      </div>
      {(() => {
        const hasLongNames = chartData.some((d) => d.type === "project" && d.name.length > 8);
        const xAxisHeight = hasLongNames ? 110 : 40;
        const xAxisAngle = hasLongNames ? -45 : 0;
        const xAxisAnchor = hasLongNames ? "end" : "middle";
        const chartHeight = hasLongNames ? 280 : 220;
        // Полоска-разделитель: по высоте ось Y, снизу выступает как ось-тик (~6px)
        // top = margin.top (20), bottom = xAxisHeight - 6
        const separatorTop = 20;
        const separatorBottom = xAxisHeight - 6;
        return (
      <div className="relative">
        {chartData.length > 1 && (
          <div
            className="absolute z-10"
            style={{
              top: `${separatorTop}px`,
              bottom: `${separatorBottom}px`,
              width: 2,
              backgroundColor: "#888",
              left: `calc(55px + (100% - 55px - 20px) * ${1 / chartData.length})`,
            }}
          />
        )}
      <ResponsiveContainer width="100%" height={chartHeight}>
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
            angle={xAxisAngle}
            textAnchor={xAxisAnchor}
            height={xAxisHeight}
            tickFormatter={(v: string) => (v.length > 18 ? `${v.substring(0, 17)}…` : v)}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={58}
            domain={[0, (max: number) => Math.max(max + 5, budgetLine + 5)]}
          />
          {budgetLine > 0 && (
            <ReferenceLine
              y={budgetLine}
              stroke={COLOR_CUMULATIVE}
              strokeDasharray="6 3"
              strokeWidth={2}
              label={
                <BudgetBadge
                  value={`Норма 2026 · ${budgetLine}%`}
                  tipTitle="Откуда эта норма"
                  tipContent={`${budgetLine}% — целевая маржинальность, принятая командой на 2026 год. Задаётся вручную (src/lib/plans.ts), НЕ считается из данных.\nНе путать с «Маржин-ть (Бюджет)» в бизнес-уравнении: та считается из бюджета PlanFact по прошедшим месяцам, поэтому числа могут не совпадать.`}
                />
              }
            />
          )}
          <Tooltip content={<CustomTooltip />} cursor={<BarCursor />} />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            barSize={60}
            onClick={handleBarClick}
            style={{ cursor: "pointer" }}
            isAnimationActive={false}
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
              style={{ fontSize: 12, fontWeight: 700, fill: "#1d1d1f" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
        );
      })()}
      <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] text-muted-foreground">
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
          <span className="inline-block border-t-2 border-dashed" style={{ borderColor: COLOR_CUMULATIVE, width: 14 }} /> Норма 2026
        </span>
      </div>
    </div>
  );
}
