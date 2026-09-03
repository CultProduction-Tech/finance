/**
 * Плановые значения показателей.
 *
 * Хардкод — осознанное решение (by design): планы задаются руками,
 * внешнего источника у них нет. Этот модуль — ЕДИНСТВЕННОЕ место,
 * где они живут; раньше проценты/чеки дублировались в route, компонентах
 * и расползались.
 *
 * ⚠️ Поменял план здесь — проверь тексты подсказок в lib/hint-texts.ts
 * (там значения упомянуты словами) .
 */

/**
 * Год, на который заданы количественные планы (запросы/проекты по месяцам).
 * Для других лет план = 0 («плана нет»): иначе 2025/2027 молча показывали бы
 * цифры 2026-го. Процентные цели и чеки — вневременные, не гейтятся.
 */
export const PLANS_YEAR = "2026";

export const BLASTER_PLANS = {
  /** План запросов по месяцам 2026 (Янв..Дек) — 13 ровно каждый месяц */
  requestsByMonth2026: [13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13],
  /** План проектов (по актам) по месяцам 2026 — 5 ровно каждый месяц */
  projectsByMonth2026: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  /** План Винрейта (Победы ÷ Завершённые), % */
  winRatePercent: 40,
  /** План Конверсии (= винрейт: Победы ÷ Завершённые), % */
  conversionPercent: 40,
  /** План Побед как доля плана Запросов */
  winsShareOfRequests: 0.40,
  /** Плановый средний чек, ₽ */
  avgCheck: 700_000,
} as const;

export const CULT_PLANS = {
  /** План запросов в месяц (целые; в одиночном месяце и коротких периодах) */
  requestsPerMonth: 16,
  /** План запросов на весь 2026 — не 16×12: годовая цель другая */
  requestsPerYear: 195,
  /** План конверсии (Проекты ÷ Запросы), % — целевая норма в бизнес-уравнении */
  conversionPercent: 25,
  /** План проектов в месяц */
  projectsPerMonth: 4,
  /** План проектов на весь 2026 — не 4×12 */
  projectsPerYear: 50,
  /** Плановый средний чек, ₽ */
  avgCheck: 3_500_000,
  /** План маржинальности, % — норма в уравнении и на графике; факт — PlanFact P&L */
  marginPercent: 20,
} as const;

/**
 * План запросов/проектов Культа за набор месяцев:
 * все 12 месяцев PLANS_YEAR → годовая цель; иначе помесячный × число месяцев года планов.
 */
export function cultCountPlan(
  kind: "requests" | "projects",
  monthKeys: readonly string[],
): number {
  const inYear = monthKeys.filter((k) => k.startsWith(`${PLANS_YEAR}-`));
  if (inYear.length === 0) return 0;
  const unique = new Set(inYear);
  if (unique.size === 12) {
    return kind === "requests" ? CULT_PLANS.requestsPerYear : CULT_PLANS.projectsPerYear;
  }
  const per = kind === "requests" ? CULT_PLANS.requestsPerMonth : CULT_PLANS.projectsPerMonth;
  return per * unique.size;
}
