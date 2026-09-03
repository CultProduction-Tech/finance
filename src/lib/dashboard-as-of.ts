import { BUSINESS_TZ } from "@/lib/timezone";
import { getPlanFactFreezeState } from "@/lib/planfact-freeze";

/** Подпись «данные на» для шапки (МСК). */
export function formatSyncedAtLabel(syncedAt: Date): string {
  const d = syncedAt.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BUSINESS_TZ,
  });
  const t = syncedAt.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TZ,
  });
  return `${d} ${t}`;
}

function moscowWeekday(now: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

export type DashboardAsOfLabel = {
  /** Полная строка */
  text: string;
  /** Платёжное окно (ср / пт–вс) */
  paymentDay: boolean;
  /**
   * Акцентная часть (розовая / подчёркнутая).
   * Ср/пт: «Сегодня платёжный день»; сб/вс: «В пятницу был платёжный день».
   */
  headline: string | null;
  /** Хвост после headline, например « — данные на чт 03.09 23:59» */
  rest: string;
};

/** Текст отметки в шапке: обычный день или платёжный. */
export function dashboardDataAsOfLabel(opts: {
  syncedAt: Date | null;
  /** если API уже отдал asOf — предпочтём его, иначе из freeze.asOfLabel */
  planFactAsOf?: string | null;
  /** подмена «сейчас» для превью платёжного дня */
  now?: Date;
}): DashboardAsOfLabel | null {
  const now = opts.now ?? new Date();
  const freeze = getPlanFactFreezeState(now);
  if (freeze.active) {
    const asOf = opts.planFactAsOf || freeze.asOfLabel || "последний снимок до окна";
    const wd = moscowWeekday(now);
    // Сб/вс — платёжный день уже прошёл (пт), данные всё ещё на чт 23:59
    const weekendAfterFriday = freeze.reason === "friday-weekend" && (wd === 6 || wd === 0);
    const headline = weekendAfterFriday
      ? "В пятницу был платёжный день"
      : "Сегодня платёжный день";
    const rest = ` — данные на ${asOf}`;
    return {
      text: `${headline}${rest}`,
      paymentDay: true,
      headline,
      rest,
    };
  }
  if (!opts.syncedAt) return null;
  const text = `Данные на ${formatSyncedAtLabel(opts.syncedAt)}`;
  return {
    text,
    paymentDay: false,
    headline: null,
    rest: text,
  };
}
