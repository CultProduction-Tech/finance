import { NextRequest, NextResponse } from "next/server";
import { getEntityConfig } from "@/lib/entity-config";
import type { LegalEntity } from "@/types/finance";

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const entity = (request.nextUrl.searchParams.get("entity") || "blaster") as LegalEntity;
  const config = getEntityConfig(entity);
  const pf = config.planfact;

  try {
    const raw = new Date();
    const now = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
    const todayStr = fmt(now);

    // Диапазон: начало текущего месяца → конец +3 месяцев
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0);

    // ===== 1. Текущий баланс (факт) =====
    const balance = await pf.getAccountBalance(todayStr);

    // ===== 2. Прошлое: реальный баланс на каждый день =====
    const pastDates: Date[] = [];
    const d = new Date(rangeStart);
    while (d <= now) {
      pastDates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    const pastBalances = await Promise.all(
      pastDates.map((date) =>
        pf.getAccountBalance(fmt(date)).then((r) => ({
          date: fmt(date),
          balance: r.total,
          type: "fact" as const,
        })),
      ),
    );

    // ===== 3. Будущее: план по дням ОДНИМ запросом (standardPeriod: Day) =====
    // Раньше здесь было ~92 однодневных getCashFlow — главный источник 429 от PlanFact.
    const futureCf = await pf.getCashFlow(todayStr, fmt(rangeEnd), { standardPeriod: "Day" });
    const dailyCashflows = (futureCf.totalValuesByPeriod || [])
      .map((item) => ({
        date: item.startDate.slice(0, 10),
        planDifference: item.planDifference,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let runningBalance = balance.total;
    const futurePoints: { date: string; balance: number; type: "plan" }[] = [];
    for (const day of dailyCashflows) {
      runningBalance += day.planDifference;
      if (day.date === todayStr) continue; // сегодня уже есть в pastBalances как факт
      futurePoints.push({
        date: day.date,
        balance: runningBalance,
        type: "plan",
      });
    }

    const points = [...pastBalances, ...futurePoints];

    return NextResponse.json({
      currentBalance: balance.total,
      points,
    });
  } catch (error) {
    console.error("Cashflow API error:", error);
    return NextResponse.json({ error: "Failed to fetch cashflow" }, { status: 500 });
  }
}
