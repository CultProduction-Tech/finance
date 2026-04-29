import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getEntityConfig } from "@/lib/entity-config";
import type { LegalEntity } from "@/types/finance";

export interface AccountBalancePoint {
  date: string; // YYYY-MM-DD
  balance: number;
  isPlan: boolean; // true для дат после "сегодня" (прогноз по БДДС)
}

export interface AccountBalanceSeriesResponse {
  fetchedAt: string;
  periodLabel: string;
  todayDate: string;
  totalBalance: number;
  series: AccountBalancePoint[];
}

const WEEK_SECONDS = 60 * 60 * 24 * 7;
const STEP_DAYS = 1;

const MONTHS_RU_FULL = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;

const MONTHS_RU_SHORT = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
] as const;

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function loadSeriesForEntity(entity: LegalEntity): Promise<AccountBalanceSeriesResponse> {
  const config = getEntityConfig(entity);
  const pf = config.planfact;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Период: с 1-го числа текущего месяца до последнего дня (текущий + 3) месяца
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 4, 0);

  // Семплы каждые STEP_DAYS, плюс "сегодня" и крайние точки
  const samples: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + STEP_DAYS)) {
    samples.push(new Date(d));
  }
  const endKey = fmt(end);
  if (fmt(samples[samples.length - 1]) !== endKey) samples.push(new Date(end));
  if (today >= start && today <= end && !samples.some((s) => fmt(s) === fmt(today))) {
    samples.push(new Date(today));
    samples.sort((a, b) => a.getTime() - b.getTime());
  }

  const pastSamples = samples.filter((d) => d <= today);

  // Параллельно: текущий остаток + БДДС-бюджеты + категории + балансы по прошлым семплам
  const [currentBalance, bdds, categories, pastResults] = await Promise.all([
    pf.getAccountBalance(today.toISOString()),
    pf.getBudgets({ budgetMethod: "Bdds" }).catch(() => null),
    pf.getOperationCategories().catch(() => null),
    Promise.all(pastSamples.map((d) => pf.getAccountBalance(d.toISOString()).catch(() => null))),
  ]);

  // Карта categoryId → "Income" / "Outcome" / null
  const categoryType = new Map<number, string>();
  for (const c of categories?.items ?? []) {
    if (c.operationCategoryType) categoryType.set(c.operationCategoryId, c.operationCategoryType);
  }

  // Карта baseline → балансы для прошлых семплов
  const balanceMap = new Map<string, number>();
  pastSamples.forEach((d, i) => {
    balanceMap.set(fmt(d), pastResults[i]?.total ?? 0);
  });
  balanceMap.set(fmt(today), currentBalance.total);

  // План: берём БДДС-бюджет, покрывающий наш период; собираем как помесячно
  // (для дней без явной плановой даты), так и поадрено по датам (для пиков)
  const planByMonth: Record<string, number> = {};
  const planByDay: Record<string, number> = {};
  const targetBudget = bdds?.items.find(
    (b) => b.budgetStatus !== "Closed" && b.startDate <= fmt(end) && b.endDate >= fmt(start),
  );
  if (targetBudget) {
    try {
      const detail = await pf.getBudgetDetail(targetBudget.budgetId);
      for (const version of detail.versions) {
        for (const item of version.info.items) {
          const dayKey = item.date.substring(0, 10); // YYYY-MM-DD
          const monthKey = item.date.substring(0, 7);
          const type = categoryType.get(item.operationCategoryId) ?? item.operationType;
          let signed = 0;
          if (type === "Income") signed = item.value;
          else if (type === "Outcome") signed = -Math.abs(item.value);
          else continue;

          planByMonth[monthKey] = (planByMonth[monthKey] ?? 0) + signed;
          // Только если день не совпадает с 1-м числом — записываем как «дневной»
          // план. Items на 1-е число обычно агрегаты на месяц.
          if (!dayKey.endsWith("-01")) {
            planByDay[dayKey] = (planByDay[dayKey] ?? 0) + signed;
          }
        }
      }
    } catch {
      /* без плана — будущие точки останутся равны текущему остатку */
    }
  }

  // Сколько плана уже привязано к конкретным датам в каждом месяце —
  // нужно чтобы остаток (агрегатные items на 1-е) распределить только по
  // дням без своих транзакций.
  const dayBoundPlanByMonth: Record<string, { totalSigned: number; daysWithPlan: Set<string> }> = {};
  for (const [day, val] of Object.entries(planByDay)) {
    const month = day.substring(0, 7);
    if (!dayBoundPlanByMonth[month]) dayBoundPlanByMonth[month] = { totalSigned: 0, daysWithPlan: new Set() };
    dayBoundPlanByMonth[month].totalSigned += val;
    dayBoundPlanByMonth[month].daysWithPlan.add(day);
  }

  let running = currentBalance.total;
  const cursor = new Date(today);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dayKey = fmt(cursor);
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const monthPlan = planByMonth[monthKey] ?? 0;
    const dayBound = dayBoundPlanByMonth[monthKey];
    const remainder = monthPlan - (dayBound?.totalSigned ?? 0);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const daysBoundCount = dayBound?.daysWithPlan.size ?? 0;
    const daysFree = Math.max(daysInMonth - daysBoundCount, 1);

    let dailyDelta: number;
    if (planByDay[dayKey] !== undefined) {
      // У этого дня есть собственная плановая транзакция
      dailyDelta = planByDay[dayKey];
    } else {
      // Распределяем остаток равномерно по «свободным» дням
      dailyDelta = remainder / daysFree;
    }
    running += dailyDelta;
    balanceMap.set(dayKey, running);
  }

  const series: AccountBalancePoint[] = samples.map((d) => {
    const key = fmt(d);
    const isPlan = d > today;
    return {
      date: key,
      balance: balanceMap.get(key) ?? running,
      isPlan,
    };
  });

  const periodLabel = `${MONTHS_RU_SHORT[start.getMonth()]} — ${MONTHS_RU_FULL[end.getMonth()]} ${end.getFullYear()}`;

  return {
    fetchedAt: new Date().toISOString(),
    periodLabel,
    todayDate: fmt(today),
    totalBalance: currentBalance.total,
    series,
  };
}

const cachedLoad = unstable_cache(
  loadSeriesForEntity,
  ["account-balance-series-v4"],
  { revalidate: WEEK_SECONDS, tags: ["account-balance"] },
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const entity = (searchParams.get("entity") || "blaster") as LegalEntity;
    const data = await cachedLoad(entity);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Account balance API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
