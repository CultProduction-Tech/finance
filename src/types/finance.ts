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
  fixedExpensesForEquation: number;
  profit: number;
  factProfit: number;
  budgetProfit: number;
  factRevenue: number;
  budgetRevenue: number;
  budgetMargin: number;
  budgetMarginPercent: number;
  budgetFixedExpenses: number;
  isPast: boolean;
  projects?: ProjectMarginality[];
  /** Проекты для маржинальности, отбакетенные по «Дате акта» (у Култа счётчик «Проекты» — по created_at, а маржа — по акту). Если undefined — график падает на m.projects. */
  marginalityProjects?: ProjectMarginality[];
  // Бизнес-уравнение: Запросы, Конверсия, Проекты
  requestsFact: number;
  requestsPlan: number;
  projectsSoldFact: number;
  projectsPlan: number;
  winsFact: number;
}

export interface ProjectMarginality {
  id: number;
  name: string;
  price: number;
  expensePlan: number;
  marginPercent: number;
}

/** Один бюджет-источник плана и месяцы периода, которые он покрывает. */
export interface BudgetSourcePart {
  title: string;
  /** Заметка команды из PlanFact — де-факто журнал утверждения («утверждено 13.07.2026») */
  description?: string | null;
  from: string; // "YYYY-MM"
  to: string;   // "YYYY-MM"
}

/** Паспорт плана: из чего он собран и не появился ли в PlanFact бюджет новее. */
export interface BudgetMeta {
  /** Обычно один элемент; два — когда период пересекает границу старый/новый бюджет */
  parts: BudgetSourcePart[];
  /**
   * Более новый бюджет того же семейства имён, который дашборд НЕ читает
   * (имя зашито в конфиге). Ровно этот случай Костя поймал глазами 21.07.
   */
  newer?: { title: string; description?: string | null } | null;
  /**
   * Бюджет нашёлся по budgetId, но под другим именем — значит его переименовали
   * в PlanFact, и конфиг разошёлся с источником. Цифры при этом корректны.
   */
  renamed?: { was: string; now: string }[] | null;
}

export interface ExpenseCategoryData {
  id: number;
  name: string;
  fact: number;
  budget: number;
}

export interface KpiData {
  revenue: number;            // Выручка (P&L → доходные статьи)
  expenseBaseRevenue?: number; // Выручка в факт/бюджет-базисе баров расходов — знаменатель «% от выручки»
  variableExpenses: number;   // Переменные расходы
  margin: number;             // Маржинальная прибыль (Выручка - Перем. расходы)
  marginPercent: number;      // Маржинальность %
  fixedExpenses: number;      // Постоянные расходы
  profit: number;             // Чистая прибыль (Маржа - Пост. расходы)
  projectsCount: number;      // Проектов
  monthly: MonthlyKpiData[];  // Помесячная разбивка
  expenseCategories: ExpenseCategoryData[];
  budgetLabel?: string;       // Подпись текущей версии бюджета (для шапки)
  budgetMeta?: BudgetMeta;    // Паспорт плана: состав + сигнал «есть бюджет новее»
  sources?: { planfact: string; amocrm: string; budget?: string }; // "ok" | текст ошибки источника; budget — не найден сконфигурированный бюджет
  projectsWithoutAct?: { id: number; name: string }[]; // Сделки периода без «Даты акта» — невидимы в графике маржинальности (оба контура)
  projectsWithoutBrief?: { id: number; name: string }[]; // Бластер: сделки периода без «Бриф получен» — невидимы в Запросах/Победах
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
  /** Google-таблица — исходник/сверка данных компании (ссылка в шапке дашборда). */
  sheetUrl: string;
  /** Воронка компании в amoCRM — источник фактических сделок. */
  amoUrl: string;
}

/** Веб-кабинет PlanFact — источник всех финансовых цифр (бюджеты, факт, остатки).
 *  Ссылка общая для контуров: аккаунты разные, вход один. */
export const PLANFACT_APP_URL = "https://app.planfact.io";

export const LEGAL_ENTITIES: LegalEntityInfo[] = [
  { id: "blaster", name: "Бластер", fullName: "ООО Бластер", sheetUrl: "https://docs.google.com/spreadsheets/d/1BDNUwlCoaqX7T9osuxYYBNHZmOa53TytASXEN-UfVIc/edit?gid=1961464443#gid=1961464443", amoUrl: "https://cultteam.amocrm.ru/leads/pipeline/10647114/" },
  { id: "cult", name: "Культ", fullName: "ООО Культ", sheetUrl: "https://docs.google.com/spreadsheets/d/1RsHm5yMbSNRIc58IAIykqhZtrEaiCkFXa66rlvj_6LQ/edit?gid=867550904#gid=867550904", amoUrl: "https://cultteam.amocrm.ru/leads/pipeline/7917842/" },
];

export const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;
