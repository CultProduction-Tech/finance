"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { KpiData } from "@/types/finance";
import { calculateKpi, filterByPeriod } from "@/lib/finance-utils";
import { MOCK_DATA_BLASTER, MOCK_DATA_CULT } from "@/lib/mock-data";
import { LegalEntity } from "@/types/finance";

const MOCK_DATA_MAP = {
  blaster: MOCK_DATA_BLASTER,
  cult: MOCK_DATA_CULT,
};

interface UseKpiOptions {
  entity: LegalEntity;
  year: number;
  startMonth: number;
  endMonth: number;
  refreshKey?: number;
}

interface UseKpiResult {
  data: KpiData | null;
  loading: boolean;
  error: string | null;
  useMock: boolean;
  syncedAt: Date | null;
  /** true — показан файловый снимок (live ещё грузится или недоступен) */
  isStale: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapKpi(json: any): KpiData {
  return {
    revenue: json.revenue,
    variableExpenses: json.variableExpenses,
    margin: json.margin,
    marginPercent: json.marginPercent,
    fixedExpenses: json.fixedExpenses,
    profit: json.profit,
    projectsCount: json.projectsCount,
    monthly: json.monthly || [],
    expenseCategories: json.expenseCategories || [],
    budgetLabel: json.budgetLabel,
    sources: json.sources,
    projectsWithoutBrief: json.projectsWithoutBrief,
  };
}

// Дедуп идентичных запросов /api/kpi между хуками. Виджет «Цели месяца» и графики
// на совпадающем периоде шлют один и тот же URL; без дедупа это два параллельных
// запроса, которые гоняются за одним лимитом amoCRM и расходятся (у одного воронка
// загрузилась, у другого 429 → нули). Общий promise = один сетевой запрос = одни данные.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inflightKpi = new Map<string, Promise<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fetchKpiJson(url: string): Promise<any> {
  const existing = inflightKpi.get(url);
  if (existing) return existing;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(json.error);
    return json;
  })().finally(() => inflightKpi.delete(url));
  inflightKpi.set(url, p);
  return p;
}

export function useKpi({ entity, year, startMonth, endMonth, refreshKey }: UseKpiOptions): UseKpiResult {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  // Растущий номер запроса: колбэки устаревших запросов (смена периода/entity) игнорируются
  const requestSeq = useRef(0);

  const startDate = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
  const endDay = new Date(year, endMonth + 1, 0).getDate();
  const endDate = `${year}-${String(endMonth + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const fetchData = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);

    const base = `/api/kpi?startDate=${startDate}&endDate=${endDate}&entity=${entity}`;

    // Фаза A — мгновенный снимок (файловый, ноль внешних запросов).
    // Применяется только пока не пришёл live и запрос не устарел.
    let liveArrived = false;
    let snapshotShown = false;
    const snapshotPromise = fetchKpiJson(`${base}&snapshot=1`)
      .then((json) => {
        if (seq !== requestSeq.current || liveArrived) return;
        setData(mapKpi(json));
        setSyncedAt(json.syncedAt ? new Date(json.syncedAt) : null);
        setIsStale(true);
        setUseMock(false);
        setLoading(false);
        snapshotShown = true;
      })
      .catch(() => { /* нет снимка — просто ждём live */ });

    // Фаза B — живые данные (PlanFact + amoCRM)
    try {
      const json = await fetchKpiJson(base);

      liveArrived = true;
      if (seq !== requestSeq.current) return;
      setData(mapKpi(json));
      setSyncedAt(json.syncedAt ? new Date(json.syncedAt) : new Date());
      setIsStale(false);
      setUseMock(false);
    } catch (err) {
      // Live упал: если успел показаться снимок — остаёмся на нём (честные данные с меткой времени).
      await snapshotPromise;
      if (seq !== requestSeq.current) return;
      if (snapshotShown) {
        console.warn("KPI live fetch failed, keeping snapshot:", err);
      } else {
        // Ничего нет вообще — последний рубеж: демо-данные (с бейджем в UI)
        console.warn("PlanFact API unavailable, using mock data:", err);
        const mockData = MOCK_DATA_MAP[entity];
        const startKey = `${year}-${String(startMonth + 1).padStart(2, "0")}`;
        const endKey = `${year}-${String(endMonth + 1).padStart(2, "0")}`;
        const filtered = filterByPeriod(mockData, startKey, endKey);
        setData(calculateKpi(filtered));
        setUseMock(true);
        setIsStale(false);
        setSyncedAt(null);
      }
      setError(null);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, entity, year, startMonth, endMonth, refreshKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, useMock, syncedAt, isStale };
}
