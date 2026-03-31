"use client";

import { useState, useEffect, useCallback } from "react";
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
}

interface UseKpiResult {
  data: KpiData | null;
  loading: boolean;
  error: string | null;
  useMock: boolean;
}

export function useKpi({ entity, year, startMonth, endMonth }: UseKpiOptions): UseKpiResult {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);

  const startDate = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
  const endDay = new Date(year, endMonth + 1, 0).getDate();
  const endDate = `${year}-${String(endMonth + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/kpi?startDate=${startDate}&endDate=${endDate}&entity=${entity}`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();

      if (json.error) {
        throw new Error(json.error);
      }

      setData({
        revenue: json.revenue,
        variableExpenses: json.variableExpenses,
        margin: json.margin,
        marginPercent: json.marginPercent,
        fixedExpenses: json.fixedExpenses,
        profit: json.profit,
        cashOnHand: json.cashOnHand,
        projectsCount: json.projectsCount,
        monthly: json.monthly || [],
        expenseCategories: json.expenseCategories || [],
      });
      setUseMock(false);
    } catch (err) {
      // Fallback на моковые данные
      console.warn("PlanFact API unavailable, using mock data:", err);
      const mockData = MOCK_DATA_MAP[entity];
      const startKey = `${year}-${String(startMonth + 1).padStart(2, "0")}`;
      const endKey = `${year}-${String(endMonth + 1).padStart(2, "0")}`;
      const filtered = filterByPeriod(mockData, startKey, endKey);
      setData(calculateKpi(filtered));
      setUseMock(true);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, entity, year, startMonth, endMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, useMock };
}
