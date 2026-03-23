import { KpiData, MonthlyFinancials } from "@/types/finance";

/**
 * Форматирует число в миллионы/тысячи с суффиксом
 * 49000000 -> "49.0 млн"
 * 1500000 -> "1.5 млн"
 * 39 -> "39%"
 */
export function formatMoney(value: number, suffix?: string): string {
  if (suffix === "%") return `${value}%`;

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    return `${sign}${millions.toFixed(1)} млн`;
  }
  if (abs >= 1_000) {
    const thousands = abs / 1_000;
    return `${sign}${thousands.toFixed(0)} тыс`;
  }
  return `${sign}${abs}`;
}

/**
 * Рассчитывает KPI за выбранный период.
 * Прошлые месяцы — факт, будущие — бюджет.
 */
export function calculateKpi(months: MonthlyFinancials[]): KpiData {
  let revenue = 0;
  let margin = 0;
  let profit = 0;
  let cashOnHand = 0;
  let projectsCount = 0;

  for (const m of months) {
    if (m.isPast) {
      revenue += m.actualRevenue;
      margin += m.actualMargin;
      profit += m.actualProfit;
    } else {
      revenue += m.budgetRevenue;
      margin += m.budgetMargin;
      profit += m.budgetProfit;
    }
    projectsCount += m.isPast ? m.projectsCount : 0;
  }

  // На счетах — берём последний прошедший месяц
  const pastMonths = months.filter((m) => m.isPast);
  if (pastMonths.length > 0) {
    cashOnHand = pastMonths[pastMonths.length - 1].cashOnHand;
  }

  const marginPercent = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

  return {
    revenue,
    variableExpenses: revenue - margin, // Переменные = Выручка - Маржа
    margin,
    marginPercent,
    fixedExpenses: margin - profit, // Постоянные = Маржа - Прибыль
    profit,
    cashOnHand,
    projectsCount,
    monthly: [],
    expenseCategories: [],
  };
}

/**
 * Фильтрует данные по диапазону месяцев
 */
export function filterByPeriod(
  data: MonthlyFinancials[],
  startMonth: string,
  endMonth: string,
): MonthlyFinancials[] {
  return data.filter((m) => m.month >= startMonth && m.month <= endMonth);
}
