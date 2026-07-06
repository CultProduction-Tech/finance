/**
 * Бизнес живёт по Москве, сервер — в UTC. Все «какой сейчас месяц/день»
 * должны считаться в бизнес-TZ, иначе 1-го числа с 00:00 до 03:00 МСК
 * дашборд показывает прошлый месяц, а лиды первых часов месяца
 * бакетятся в соседний.
 *
 * У МСК нет перехода на летнее время → фиксированный оффсет +03:00 безопасен.
 */

export const BUSINESS_TZ = "Europe/Moscow";
export const BUSINESS_TZ_OFFSET = "+03:00";

/** Сегодняшняя дата в бизнес-TZ: "YYYY-MM-DD" (sv-SE даёт ISO-формат) */
export function todayInBusinessTz(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: BUSINESS_TZ });
}

/** Текущий месяц в бизнес-TZ: "YYYY-MM" */
export function currentMonthInBusinessTz(): string {
  return todayInBusinessTz().slice(0, 7);
}
