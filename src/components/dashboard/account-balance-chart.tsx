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

interface AccountBalanceChartProps {
  entity: LegalEntity;
}

const COLOR = CHART_COLORS.neutral; // зелёный

function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
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
        padding: "6px 10px",
        fontSize: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ fontWeight: 600, color: "#1d1d1f" }}>
        {formatDateRu(point.date)}
        {point.isPlan && <span style={{ color: "#86868b", fontWeight: 400, marginLeft: 6 }}>план</span>}
      </div>
      <div style={{ color: COLOR, marginTop: 2 }}>{formatMoney(point.balance)} ₽</div>
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

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] transition-shadow p-5">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-base font-semibold tracking-tight">
            💰 Остатки на счетах
          </h3>
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

      {loading ? (
        <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
          Загрузка остатков…
        </div>
      ) : error ? (
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
              <linearGradient id="balanceGradientFact" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR} stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="balanceGradientPlan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR} stopOpacity={0.18} />
                <stop offset="100%" stopColor={COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#86868b" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatTickDate}
              minTickGap={48}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#86868b" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatMoney}
              width={56}
            />
            <Tooltip content={<CustomTooltip />} />
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
              type="monotone"
              dataKey="factBalance"
              stroke={COLOR}
              strokeWidth={2}
              fill="url(#balanceGradientFact)"
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="planBalance"
              stroke={COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="url(#balanceGradientPlan)"
              connectNulls
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
