"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useAccountBalance } from "@/lib/use-account-balance";
import { LegalEntity } from "@/types/finance";
import { CHART_COLORS } from "@/lib/chart-colors";
import { ChartCardSkeleton } from "./loading-skeletons";

interface AccountBalanceChartProps {
  entity: LegalEntity;
}

const COLOR = CHART_COLORS.neutral; // зелёный (положительный)
const COLOR_NEG = CHART_COLORS.negative; // красный (для значений ниже нуля)

function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} тыс`;
  return `${sign}${Math.round(abs)}`;
}

/** Формат с явным знаком: для тултипа, чтобы знак был всегда виден */
function formatMoneyWithSign(value: number): string {
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} тыс`;
  return `${sign}${Math.round(abs)}`;
}

function formatDateRu(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTickDate(date: string): string {
  // YYYY-MM-DD → DD.MM
  const [, m, d] = date.split("-");
  return `${d}.${m}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as { date: string; balance: number; isPlan: boolean } | undefined;
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
      <div style={{ fontWeight: 600, color: "#1d1d1f" }}>
        {formatDateRu(point.date)}
        {point.isPlan && <span style={{ color: "#86868b", fontWeight: 400, marginLeft: 6 }}>план</span>}
      </div>
      <div
        style={{
          color: point.balance < 0 ? COLOR_NEG : COLOR,
          fontWeight: 600,
          marginTop: 2,
        }}
      >
        {formatMoneyWithSign(point.balance)} ₽
      </div>
    </div>
  );
}

export function AccountBalanceChart({ entity }: AccountBalanceChartProps) {
  const { data, loading, error } = useAccountBalance(entity);

  // Раскладываем балансы по двум полям (factBalance/planBalance) с общей "стыковочной"
  // точкой (последняя фактическая = первая плановая), чтобы линия была без разрыва.
  const stitched = useMemo(() => {
    if (!data) return [];
    const lastFactIdx = data.series.findLastIndex((p) => !p.isPlan);
    return data.series.map((p, i) => ({
      date: p.date,
      isPlan: p.isPlan,
      balance: p.balance,
      factBalance: p.isPlan ? null : p.balance,
      planBalance: p.isPlan || i === lastFactIdx ? p.balance : null,
    }));
  }, [data]);

  // Позиция нуля в градиенте — считается ОТДЕЛЬНО для каждой серии (fact/plan),
  // потому что SVG-градиент мапится на bbox конкретного Area. Если считать
  // глобально, у короткой серии (например, всё позитивный факт) граница
  // зелёного и красного смещается внутрь bbox, и положительные значения
  // окрашиваются в красный.
  const calcZeroPos = (vals: number[]): number => {
    if (vals.length === 0) return 1;
    // baseValue={0} включает 0 в bbox области заливки
    const top = Math.max(...vals, 0);
    const bot = Math.min(...vals, 0);
    if (top === bot) return 1;
    if (bot >= 0) return 1; // всё положительное → только зелёный
    if (top <= 0) return 0; // всё отрицательное → только красный
    return top / (top - bot);
  };

  const factZeroPos = useMemo(() => {
    if (!data) return 1;
    return calcZeroPos(stitched.filter((p) => p.factBalance !== null).map((p) => p.factBalance!));
  }, [data, stitched]);

  const planZeroPos = useMemo(() => {
    if (!data) return 1;
    return calcZeroPos(stitched.filter((p) => p.planBalance !== null).map((p) => p.planBalance!));
  }, [data, stitched]);

  const factZeroPct = `${(factZeroPos * 100).toFixed(2)}%`;
  const planZeroPct = `${(planZeroPos * 100).toFixed(2)}%`;

  // Линия (stroke) использует bbox самой линии, без baseline.
  // Если все значения одного знака — используем сплошной цвет.
  const factLineMode = useMemo(() => {
    if (!data) return { mode: "solid" as const, color: COLOR };
    const vals = stitched.filter((p) => p.factBalance !== null).map((p) => p.factBalance!);
    if (vals.length < 2) return { mode: "solid" as const, color: COLOR };
    const min = Math.min(...vals), max = Math.max(...vals);
    if (min >= 0) return { mode: "solid" as const, color: COLOR };
    if (max <= 0) return { mode: "solid" as const, color: COLOR_NEG };
    return { mode: "gradient" as const, zeroPct: `${(max / (max - min) * 100).toFixed(2)}%` };
  }, [data, stitched]);

  const planLineMode = useMemo(() => {
    if (!data) return { mode: "solid" as const, color: COLOR };
    const vals = stitched.filter((p) => p.planBalance !== null).map((p) => p.planBalance!);
    if (vals.length < 2) return { mode: "solid" as const, color: COLOR };
    const min = Math.min(...vals), max = Math.max(...vals);
    if (min >= 0) return { mode: "solid" as const, color: COLOR };
    if (max <= 0) return { mode: "solid" as const, color: COLOR_NEG };
    return { mode: "gradient" as const, zeroPct: `${(max / (max - min) * 100).toFixed(2)}%` };
  }, [data, stitched]);

  if (loading) return <ChartCardSkeleton variant="line" height={240} />;

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-lg font-bold">🏦 Остатки на счетах</h3>
          {data && (
            <span className="text-xl font-semibold tabular-nums text-[#1d1d1f]">
              {formatMoney(data.totalBalance)} ₽
            </span>
          )}
          {data && (
            <span className="text-[12px] text-[#86868b]">· {data.periodLabel}</span>
          )}
        </div>
        {data && (
          <span className="text-[11px] text-[#86868b]">
            Данные на {formatDateRu(data.fetchedAt)}
          </span>
        )}
      </div>

      {error ? (
        <div className="h-[240px] flex items-center justify-center text-sm text-red-600/80">
          Не удалось загрузить данные: {error}
        </div>
      ) : !data || data.series.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
          Нет данных
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={stitched} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <defs>
              {/* Жёсткий cut на нуле: цвет полностью прозрачный у самой нулевой
                  линии, чёткое разделение зон без перетекания. Каждая серия
                  имеет свой zeroPct, потому что SVG-градиент мапится к bbox
                  конкретной Area. */}
              <linearGradient id="balanceGradientFact" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR} stopOpacity={0.4} />
                <stop offset={factZeroPct} stopColor={COLOR} stopOpacity={0} />
                <stop offset={factZeroPct} stopColor={COLOR_NEG} stopOpacity={0} />
                <stop offset="100%" stopColor={COLOR_NEG} stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="balanceGradientPlan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR} stopOpacity={0.2} />
                <stop offset={planZeroPct} stopColor={COLOR} stopOpacity={0} />
                <stop offset={planZeroPct} stopColor={COLOR_NEG} stopOpacity={0} />
                <stop offset="100%" stopColor={COLOR_NEG} stopOpacity={0.2} />
              </linearGradient>
              {factLineMode.mode === "gradient" && (
                <linearGradient id="balanceStrokeFact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR} />
                  <stop offset={factLineMode.zeroPct} stopColor={COLOR} />
                  <stop offset={factLineMode.zeroPct} stopColor={COLOR_NEG} />
                  <stop offset="100%" stopColor={COLOR_NEG} />
                </linearGradient>
              )}
              {planLineMode.mode === "gradient" && (
                <linearGradient id="balanceStrokePlan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR} />
                  <stop offset={planLineMode.zeroPct} stopColor={COLOR} />
                  <stop offset={planLineMode.zeroPct} stopColor={COLOR_NEG} />
                  <stop offset="100%" stopColor={COLOR_NEG} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatTickDate}
              minTickGap={48}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatMoney}
              width={56}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Видимая нулевая линия — точка отсчёта между плюсом и минусом */}
            <ReferenceLine y={0} stroke="#1d1d1f" strokeOpacity={0.35} strokeWidth={1} />
            <ReferenceLine
              x={data.todayDate}
              stroke="#bbb"
              strokeDasharray="4 4"
              label={{
                value: "сегодня",
                position: "insideTopRight",
                fill: "#86868b",
                fontSize: 11,
              }}
            />
            <Area
              type="linear"
              dataKey="factBalance"
              stroke={factLineMode.mode === "solid" ? factLineMode.color : "url(#balanceStrokeFact)"}
              strokeWidth={2}
              fill="url(#balanceGradientFact)"
              baseValue={0}
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="linear"
              dataKey="planBalance"
              stroke={planLineMode.mode === "solid" ? planLineMode.color : "url(#balanceStrokePlan)"}
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="url(#balanceGradientPlan)"
              baseValue={0}
              connectNulls
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
