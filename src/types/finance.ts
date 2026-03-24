export interface MonthlyData {
  month: string; // "2026-01", "2026-02", etc.
  label: string; // "Январь", "Февраль", etc.
}

export interface MonthlyKpiData {
  month: string;
  revenue: number;
  variableExpenses: number;
  margin: number;
  marginPercent: number;
  fixedExpenses: number;
  profit: number;
  factProfit: number;
  budgetProfit: number;
  factRevenue: number;
  factProfitability: number;
  budgetRevenue: number;
  budgetMargin: number;
  budgetMarginPercent: number;
  budgetFixedExpenses: number;
  isPast: boolean;
  projects?: ProjectMarginality[];
  // Бизнес-уравнение: Запросы, Конверсия, Проекты
  requestsFact: number;
  requestsPlan: number;
  projectsSoldFact: number;
  projectsSoldRevenue: number;
  projectsPlan: number;
}

export interface ProjectMarginality {
  id: number;
  name: string;
  price: number;
  expensePlan: number;
  marginPercent: number;
}

export interface ExpenseCategoryData {
  id: number;
  name: string;
  fact: number;
  budget: number;
}

export interface KpiData {
  revenue: number;            // Выручка (P&L → доходные статьи)
  variableExpenses: number;   // Переменные расходы
  margin: number;             // Маржинальная прибыль (Выручка - Перем. расходы)
  marginPercent: number;      // Маржинальность %
  fixedExpenses: number;      // Постоянные расходы
  profit: number;             // Чистая прибыль (Маржа - Пост. расходы)
  cashOnHand: number;         // На счетах
  projectsCount: number;      // Проектов
  monthly: MonthlyKpiData[];  // Помесячная разбивка
  expenseCategories: ExpenseCategoryData[];
}

export interface MonthlyFinancials extends MonthlyData {
  // Факт (из отчёта P&L)
  actualRevenue: number;
  actualMargin: number;
  actualMarginPercent: number;
  actualProfit: number;
  actualProfitability: number; // Рентабельность чистой прибыли

  // Бюджет
  budgetRevenue: number;
  budgetMargin: number;
  budgetMarginPercent: number;
  budgetProfit: number;

  // Доп. показатели
  cashOnHand: number;
  projectsCount: number;

  // Флаг: прошёл ли месяц
  isPast: boolean;
}

export type LegalEntity = "blaster" | "cult";

export interface LegalEntityInfo {
  id: LegalEntity;
  name: string;
  fullName: string;
}

export const LEGAL_ENTITIES: LegalEntityInfo[] = [
  { id: "blaster", name: "Бластер", fullName: "ООО Бластер" },
  { id: "cult", name: "Культ", fullName: "ООО Культ" },
];

export const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;
