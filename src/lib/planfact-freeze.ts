/**
 * Платёжные дни (ср, пт) — данные PlanFact «плавают», дашборд не обновляет ПФ.
 *
 * Окно заморозки (таймзона Москва):
 *   Ср 00:00 → Чт 00:00  — показываем снимок до Ср (цель: Вт 23:59)
 *   Пт 00:00 → Пн 00:00  — показываем снимок до Пт (цель: Чт 23:59)
 *
 * AmoCRM в эти дни обновляется как обычно. Касается только PlanFact.
 */

import { BUSINESS_TZ } from "@/lib/timezone";

export type PlanFactFreezeReason = "wednesday" | "friday-weekend";

export interface PlanFactFreezeState {
  active: boolean;
  reason: PlanFactFreezeReason | null;
  /** Начало окна заморозки, ISO с оффсетом Москвы */
  windowStartIso: string | null;
  /** Подпись для UI: «вт 26.08 23:59» */
  asOfLabel: string | null;
}

function moscowParts(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  return { ymd, weekday: wdMap[parts.weekday] ?? 0 };
}

/** Сдвиг календарного дня YYYY-MM-DD на n дней (в UTC-полуночи достаточно для даты). */
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function labelRuDay2359(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Полдень UTC → стабильный weekday в MSK для этой даты
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wd = new Intl.DateTimeFormat("ru-RU", { timeZone: BUSINESS_TZ, weekday: "short" }).format(dt);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${wd} ${dd}.${mm} 23:59`;
}

export function getPlanFactFreezeState(now: Date = new Date()): PlanFactFreezeState {
  const { ymd, weekday } = moscowParts(now);

  // Среда
  if (weekday === 3) {
    const tue = addDaysYmd(ymd, -1);
    return {
      active: true,
      reason: "wednesday",
      windowStartIso: `${ymd}T00:00:00+03:00`,
      asOfLabel: labelRuDay2359(tue),
    };
  }

  // Пятница / суббота / воскресенье
  if (weekday === 5 || weekday === 6 || weekday === 0) {
    const daysFromFri = weekday === 5 ? 0 : weekday === 6 ? 1 : 2;
    const fri = addDaysYmd(ymd, -daysFromFri);
    const thu = addDaysYmd(fri, -1);
    return {
      active: true,
      reason: "friday-weekend",
      windowStartIso: `${fri}T00:00:00+03:00`,
      asOfLabel: labelRuDay2359(thu),
    };
  }

  return { active: false, reason: null, windowStartIso: null, asOfLabel: null };
}

/** Снимок годится для заморозки, если снят до начала платёжного окна. */
export function isSnapshotBeforeFreeze(
  snapshotAtIso: string,
  freeze: PlanFactFreezeState,
): boolean {
  if (!freeze.active || !freeze.windowStartIso) return false;
  return new Date(snapshotAtIso).getTime() < new Date(freeze.windowStartIso).getTime();
}
