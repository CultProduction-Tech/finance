import { NextRequest, NextResponse } from "next/server";
import { getEntityConfig } from "@/lib/entity-config";
import type { LegalEntity } from "@/types/finance";
import { saveSnapshot, readSnapshot } from "@/lib/snapshot";
import { todayInBusinessTz } from "@/lib/timezone";

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CashflowResponsePayload {
  currentBalance: number;
  points: { date: string; balance: number; type: "fact" | "plan" }[];
  syncedAt?: string;
  snapshot?: boolean;
}

export async function GET(request: NextRequest) {
  const entity = (request.nextUrl.searchParams.get("entity") || "blaster") as LegalEntity;
  const config = getEntityConfig(entity);
  const pf = config.planfact;

  const snapshotKey = `cashflow-${entity}`;
  if (request.nextUrl.searchParams.get("snapshot") === "1") {
    const snap = await readSnapshot<CashflowResponsePayload>(snapshotKey);
    if (!snap) {
      return NextResponse.json({ error: "no snapshot yet" }, { status: 404 });
    }
    return NextResponse.json({ ...snap.payload, syncedAt: snap.snapshotAt, snapshot: true });
  }

  try {
    // «Сегодня» — по бизнес-TZ (Москва), не по UTC сервера
    const todayStr = todayInBusinessTz();
    const now = new Date(`${todayStr}T00:00:00`);

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

    // ===== 3. Будущее: плановые операции ОДНИМ запросом, агрегация по дням =====
    // Раньше здесь было ~92 однодневных getCashFlow — главный источник 429 от PlanFact.
    // planDifference дня = Σ(Income) − Σ(Outcome) плановых операций (сверено с эталоном).
    const rangeEndStr = fmt(rangeEnd);
    const plannedOps = await pf.getPlannedOperations(todayStr, rangeEndStr);
    const planDiffByDate = new Map<string, number>();
    for (const op of plannedOps) {
      const d = op.operationDate?.slice(0, 10);
      // API может вернуть операции вне запрошенного периода — фильтруем сами
      if (!d || d < todayStr || d > rangeEndStr) continue;
      const sign = op.operationType === "Income" ? 1 : op.operationType === "Outcome" ? -1 : 0;
      planDiffByDate.set(d, (planDiffByDate.get(d) || 0) + sign * op.value);
    }
    // Полная дневная сетка [сегодня..конец диапазона] — дни без плановых операций дают 0
    const dailyCashflows: { date: string; planDifference: number }[] = [];
    const fd = new Date(`${todayStr}T00:00:00`);
    while (fd <= rangeEnd) {
      const ds = fmt(fd);
      dailyCashflows.push({ date: ds, planDifference: planDiffByDate.get(ds) || 0 });
      fd.setDate(fd.getDate() + 1);
    }

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

    const payload: CashflowResponsePayload = {
      currentBalance: balance.total,
      points,
      syncedAt: new Date().toISOString(),
    };
    await saveSnapshot(snapshotKey, payload);

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Cashflow API error:", error);
    return NextResponse.json({ error: "Failed to fetch cashflow" }, { status: 500 });
  }
}
