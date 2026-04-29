"use client";

import { useEffect, useState } from "react";
import { LegalEntity } from "@/types/finance";
import type { AccountBalanceSeriesResponse } from "@/app/api/account-balance/route";

interface UseAccountBalanceResult {
  data: AccountBalanceSeriesResponse | null;
  loading: boolean;
  error: string | null;
}

export function useAccountBalance(entity: LegalEntity): UseAccountBalanceResult {
  const [data, setData] = useState<AccountBalanceSeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/account-balance?entity=${entity}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: AccountBalanceSeriesResponse) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entity]);

  return { data, loading, error };
}
