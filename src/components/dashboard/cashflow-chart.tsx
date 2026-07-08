"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { LegalEntity } from "@/types/finance";
import { Hint } from "@/components/ui/hint";
import { getHint } from "@/lib/hint-texts";
import { todayInBusinessTz } from "@/lib/timezone";

interface CashflowPoint {
  date: string;
  balance: number;
  type: "fact" | "plan";
}

interface CashflowData {
  currentBalance: number;
  points: CashflowPoint[];
  syncedAt?: string;
  snapshot?: boolean;
}

interface CashflowChartProps {
  entity: LegalEntity;
  refreshKey?: number;
  onLastBalance?: (balance: number | null) => void;
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} тыс`;
  return `${sign}${Math.round(abs)}`;
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as { date: string; balance: number; type: string } | undefined;
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
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{formatDate(point.date)}</p>
      <p style={{ color: point.balance >= 0 ? CHART_COLORS.neutral : CHART_COLORS.negative }}>
        Остаток: {formatValue(point.balance)}
      </p>
      <p style={{ color: "#86868b", fontSize: 11, marginTop: 2 }}>
        {point.type === "fact" ? "Факт" : "Прогноз"}
      </p>
    </div>
  );
}

const POSITIVE = CHART_COLORS.neutral;
const NEGATIVE = CHART_COLORS.negative;

export function CashflowChart({ entity, refreshKey, onLastBalance }: CashflowChartProps) {
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(true);

  // Возврат спиннера при рефетче (смена контура / «Обновить») —
  // adjust-during-render вместо синхронного setState в эффекте
  const fetchKey = `${entity}:${refreshKey}`;
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey);
  if (prevFetchKey !== fetchKey) {
    setPrevFetchKey(fetchKey);
    setLoading(true);
  }

  useEffect(() => {
    let liveArrived = false;
    let cancelled = false;

    const apply = (d: CashflowData) => {
      if (cancelled || !d.points) return;
      setData(d);
      setLoading(false);
      if (onLastBalance && d.points.length) {
        onLastBalance(d.points[d.points.length - 1].balance);
      }
    };

    // Фаза A: мгновенный снимок
    fetch(`/api/cashflow?entity=${entity}&snapshot=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !liveArrived) apply(d);
      })
      .catch(() => {});

    // Фаза B: живые данные
    fetch(`/api/cashflow?entity=${entity}`)
      .then((r) => r.json())
      .then((d) => {
        liveArrived = true;
        apply(d);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entity, refreshKey, onLastBalance]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 h-[280px] flex items-center justify-center text-muted-foreground text-sm">
        Загрузка...
      </div>
    );
  }

  if (!data?.points?.length) {
    return (
      <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 h-[280px] flex items-center justify-center text-muted-foreground text-sm">
        Нет данных
      </div>
    );
  }

  const chartData = data.points.map((p) => ({
    date: p.date,
    label: formatDate(p.date),
    balance: Math.round(p.balance),
    type: p.type,
  }));

  const hasNegative = chartData.some((d) => d.balance < 0);
  // «Сегодня» — по бизнес-TZ (Москва), как серверная сетка точек кэшфлоу.
  // new Date().toISOString() дал бы UTC-дату и с 00:00 до 03:00 МСК маркер съезжал на вчера.
  const todayStr = todayInBusinessTz();
  const tickInterval = Math.max(1, Math.floor(chartData.length / 8));

  // Зеро-кроссинг градиента: SVG-offset, на котором цвет переключается с зелёного на красный.
  // Bbox области заливки расширяется до y=0 (baseValue Recharts), поэтому считаем относительно [min(0, yMin)..max(0, yMax)].
  const yMax = Math.max(0, ...chartData.map((d) => d.balance));
  const yMin = Math.min(0, ...chartData.map((d) => d.balance));
  const yRange = yMax - yMin || 1;
  const zeroOffset = yMax / yRange; // 0 — всё красное; 1 — всё зелёное

  // Подписи дат. «Данные на» — реальное время данных с сервера (для снимка — время снимка).
  const monthsShort = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  const syncedDate = data.syncedAt ? new Date(data.syncedAt) : new Date();
  const dataAsOf = `${String(syncedDate.getDate()).padStart(2, "0")}.${String(syncedDate.getMonth() + 1).padStart(2, "0")}.${syncedDate.getFullYear()} ${String(syncedDate.getHours()).padStart(2, "0")}:${String(syncedDate.getMinutes()).padStart(2, "0")}${data.snapshot ? " (снимок)" : ""}`;
  const startDate = chartData[0]?.date;
  const endDate = chartData[chartData.length - 1]?.date;
  const periodLabel = startDate && endDate
    ? `${monthsShort[parseInt(startDate.split("-")[1]) - 1]} — ${monthsShort[parseInt(endDate.split("-")[1]) - 1]} ${endDate.split("-")[0]}`
    : "";

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] transition-shadow duration-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-3">
          {(() => {
            const hint = getHint(entity, "chart_cashflow");
            const titleEl = <h3 className="text-lg font-bold">&#x1F3E6; Остатки на счетах</h3>;
            return hint ? (
              <Hint title={hint.title} content={hint.content} side="bottom">{titleEl}</Hint>
            ) : titleEl;
          })()}
          <span
            className="text-[15px] font-semibold tabular-nums"
            style={{ color: data.currentBalance >= 0 ? POSITIVE : NEGATIVE }}
          >
            {formatValue(data.currentBalance)}
          </span>
          <span className="text-[13px] font-medium text-muted-foreground">{periodLabel}</span>
        </div>
        <span className="text-xs text-muted-foreground">Данные на {dataAsOf}</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="cashflowStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={POSITIVE} stopOpacity={1} />
              <stop offset={zeroOffset} stopColor={POSITIVE} stopOpacity={1} />
              <stop offset={zeroOffset} stopColor={NEGATIVE} stopOpacity={1} />
              <stop offset={1} stopColor={NEGATIVE} stopOpacity={1} />
            </linearGradient>
            <linearGradient id="cashflowFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={POSITIVE} stopOpacity={0.20} />
              <stop offset={zeroOffset} stopColor={POSITIVE} stopOpacity={0} />
              <stop offset={zeroOffset} stopColor={NEGATIVE} stopOpacity={0} />
              <stop offset={1} stopColor={NEGATIVE} stopOpacity={0.20} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            interval={tickInterval}
          />
          <YAxis
            tickFormatter={(v) => formatValue(v)}
            tick={{ fontSize: 13 }}
            className="fill-muted-foreground"
            width={75}
          />
          {hasNegative && (
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="url(#cashflowStroke)"
            strokeWidth={2}
            fill="url(#cashflowFill)"
            baseValue={0}
            dot={(props) => {
              const { cx, cy, payload } = props;
              if (payload.date !== todayStr) return <circle key={payload.date} r={0} />;
              return (
                <circle
                  key={payload.date}
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={payload.balance >= 0 ? POSITIVE : NEGATIVE}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={(props) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { cx, cy, payload } = props as any;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={payload.balance >= 0 ? POSITIVE : NEGATIVE}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-5 mt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: POSITIVE }} /> Остаток
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: POSITIVE }} /> Сегодня
        </span>
        {hasNegative && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block border-t-2 border-dashed border-red-400" style={{ width: 14 }} /> Кассовый разрыв
          </span>
        )}
      </div>
    </div>
  );
}
