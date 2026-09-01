import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_TZ, todayInBusinessTz } from "@/lib/timezone";
import { getPlanFactFreezeState } from "@/lib/planfact-freeze";

/**
 * Прогрев снимков PlanFact перед платёжными днями.
 *
 * Вызывать по cron во вт и чт ~23:50 МСК:
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     https://financial-dashboard.ru/api/cron/warmup-planfact
 *
 * Пишет data/snapshots для KPI (текущий месяц + год) и cashflow — оба юрлица.
 * В окно заморозки (ср / пт–вс) — no-op (не затираем хороший снимок).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type WarmResult = {
  url: string;
  ok: boolean;
  status?: number;
  ms: number;
  error?: string;
};

function monthEnd(year: number, month1based: number): string {
  const last = new Date(year, month1based, 0).getDate();
  return `${year}-${String(month1based).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

async function warm(url: string, secret: string): Promise<WarmResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
      cache: "no-store",
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { url, ok: false, status: res.status, ms, error: text.slice(0, 200) };
    }
    // тело читаем, чтобы маршрут доработал saveSnapshot
    await res.json().catch(() => null);
    return { url, ok: true, status: res.status, ms };
  } catch (e) {
    return {
      url,
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const freeze = getPlanFactFreezeState();
  if (freeze.active) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "planfact-freeze",
      freeze,
      at: new Date().toISOString(),
    });
  }

  // База для внутренних запросов: явный INTERNAL_APP_URL или localhost текущего процесса
  const origin =
    process.env.INTERNAL_APP_URL
    || `http://127.0.0.1:${process.env.PORT || "3000"}`;

  const today = todayInBusinessTz(); // YYYY-MM-DD МСК
  const year = parseInt(today.slice(0, 4), 10);
  const month = parseInt(today.slice(5, 7), 10);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndStr = monthEnd(year, month);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const entities = ["blaster", "cult"] as const;
  const jobs: string[] = [];
  for (const entity of entities) {
    jobs.push(`${origin}/api/cashflow?entity=${entity}`);
    jobs.push(
      `${origin}/api/kpi?entity=${entity}&startDate=${monthStart}&endDate=${monthEndStr}`,
    );
    jobs.push(
      `${origin}/api/kpi?entity=${entity}&startDate=${yearStart}&endDate=${yearEnd}`,
    );
  }

  // Последовательно: PlanFact/amo не любят burst (семафоры есть, но cron не срочный)
  const results: WarmResult[] = [];
  for (const url of jobs) {
    results.push(await warm(url, secret));
  }

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: failed.length === 0,
    at: new Date().toISOString(),
    businessToday: today,
    businessTz: BUSINESS_TZ,
    origin,
    warmed: results.length,
    failed: failed.length,
    results,
  }, { status: failed.length === 0 ? 200 : 207 });
}
