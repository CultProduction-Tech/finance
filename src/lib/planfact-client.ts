/**
 * Клиент для работы с API ПланФакт
 * Docs: https://apidoc.planfact.io/
 */

const API_URL = process.env.PLANFACT_API_URL || "https://api.planfact.io";
const API_KEY = process.env.PLANFACT_API_KEY || "";

interface PlanFactResponse<T> {
  data: T;
  isSuccess: boolean;
  errorMessage: string | null;
  errorCode: string | null;
}

async function pfFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, value);
      }
    });
  }

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "X-ApiKey": API_KEY,
    },
    next: { revalidate: 300 }, // кэш 5 мин
  });

  if (!res.ok) {
    throw new Error(`PlanFact API error: ${res.status} ${res.statusText}`);
  }

  const json: PlanFactResponse<T> = await res.json();

  if (!json.isSuccess) {
    throw new Error(`PlanFact API: ${json.errorMessage || json.errorCode}`);
  }

  return json.data;
}

// ============ Типы ответов ============

export interface AccountBalanceItem {
  accountId: number;
  total: number;
  totalInUserCurrency: number;
  account: {
    accountId: number;
    title: string | null;
    companyId: number;
    currencyCode: string;
    active: boolean | null;
  };
}

export interface AccountBalanceResponse {
  total: number;
  items: AccountBalanceItem[];
}

export interface CashFlowPeriodItem {
  incomePlanValue: number;
  incomeFactValue: number;
  outcomePlanValue: number;
  outcomeFactValue: number;
  planDifference: number;
  factDifference: number;
  startDate: string;
  endDate: string;
}

export interface CashFlowResponse {
  incomePlanValue: number;
  incomeFactValue: number;
  outcomePlanValue: number;
  outcomeFactValue: number;
  planDifference: number;
  factDifference: number;
  totalValuesByPeriod: CashFlowPeriodItem[];
}

export interface BizInfoDetail {
  date: string;
  factValue: number;
  planValue: number;
  factValueInUserCurrency: number;
  planValueInUserCurrency: number;
  operationCategoryId: number;
  projectId: number;
  isOpuCalculation: boolean | null;
}

export interface BizInfoByCategoryItem {
  operationCategoryId: number;
  details: BizInfoDetail[];
}

export interface BizInfoByProjectItem {
  projectId: number;
  details: BizInfoDetail[];
}

export interface ProjectItem {
  projectId: number;
  title: string | null;
  active: boolean | null;
  closed: boolean;
  firstOperationDate: string | null;
  lastOperationDate: string | null;
  sumOfIncomeFact: number;
  sumOfOutcomeFact: number;
  sumOfIncomePlan: number;
  sumOfOutcomePlan: number;
  createDate: string;
  projectGroup: {
    projectGroupId: number;
    title: string;
  } | null;
}

export interface ProjectsResponse {
  items: ProjectItem[];
  total: number;
}

export interface BudgetItem {
  budgetId: string;
  title: string | null;
  budgetStatus: string;
  startDate: string;
  endDate: string;
  budgetMethod: string; // 'Bdr' (P&L) | 'Bdds' (cash flow)
  entityIds: number[];
  projectIds: number[];
}

export interface BudgetsResponse {
  items: BudgetItem[];
  total: number;
}

export interface BudgetVersionItem {
  operationCategoryId: number;
  entityId: number;
  date: string;
  value: number;
  valueInUserCurrency: number | null;
  operationType: string;
  outcomeOperationCategoryClassification: string;
}

export interface BudgetVersion {
  budgetType: string;
  budgetDirectionType: string;
  info: {
    entityIds: number[];
    items: BudgetVersionItem[];
  };
}

export interface BudgetDetailResponse extends BudgetItem {
  versions: BudgetVersion[];
}

export interface OperationCategoryItem {
  operationCategoryId: number;
  title: string | null;
  operationCategoryType: string; // 'Income' | 'Outcome' | 'Assets' | 'Liabilities' | 'Capital'
  accountCategoryType: string;   // 'Income' | 'IncomeOther' | 'Outcome' | 'OutcomeOther' | ...
  outcomeClassification: string; // 'None' | 'DirectVariable' | 'IndirectFixed'
  parentOperationCategoryId: number | null;
  active: boolean | null;
}

export interface OperationCategoriesResponse {
  items: OperationCategoryItem[];
  total: number;
}

export interface CompanyItem {
  companyId: number;
  title: string | null;
  active: boolean | null;
}

export interface CompaniesResponse {
  items: CompanyItem[];
  total: number;
}

export interface PaymentStructureDetail {
  operationCategoryId: number;
  operationCategory: {
    operationCategoryId: number;
    title: string | null;
    isFixed: boolean;
  };
  operationsCount: number;
  planValue: number;
  factValue: number;
  planPercentByTotalValue: number | null;
  factPercentByTotalValue: number | null;
}

export interface PaymentStructureItem {
  operationCategoryId: number;
  planValue: number;
  factValue: number;
  details: PaymentStructureDetail[] | null;
}

export interface PaymentStructureResponse {
  items: PaymentStructureItem[] | null;
}

// ============ API методы ============

/** Остатки на счетах */
export async function getAccountBalance(currentDate: string, accountIds?: number[]) {
  const params: Record<string, string> = {
    "filter.currentDate": currentDate,
  };
  if (accountIds?.length) {
    accountIds.forEach((id, i) => {
      params[`filter.accountIds[${i}]`] = String(id);
    });
  }
  return pfFetch<AccountBalanceResponse>("/api/v1/businessmetrics/accountbalance", params);
}

/** Денежный поток за период (помесячно) */
export async function getCashFlow(
  startDate: string,
  endDate: string,
  options?: {
    isCalculation?: boolean;
    accountIds?: number[];
    projectIds?: number[];
    standardPeriod?: "Day" | "Week" | "Month" | "Quarter" | "Year";
  },
) {
  const params: Record<string, string> = {
    "filter.periodStartDate": startDate,
    "filter.periodEndDate": endDate,
    "filter.standardPeriod": options?.standardPeriod || "Month",
  };
  if (options?.isCalculation !== undefined) {
    params["filter.isCalculation"] = String(options.isCalculation);
  }
  if (options?.accountIds?.length) {
    options.accountIds.forEach((id, i) => {
      params[`filter.accountId[${i}]`] = String(id);
    });
  }
  if (options?.projectIds?.length) {
    options.projectIds.forEach((id, i) => {
      params[`filter.projectId[${i}]`] = String(id);
    });
  }
  return pfFetch<CashFlowResponse>("/api/v1/businessmetrics/cashflow", params);
}

/** История поступлений/выплат по статьям */
export async function getBizInfoByCategories(
  startDate: string,
  endDate: string,
  options?: {
    isCalculation?: boolean;
    projectIds?: number[];
    operationCategoryIds?: number[];
  },
) {
  const params: Record<string, string> = {
    "filter.periodStartDate": startDate,
    "filter.periodEndDate": endDate,
  };
  if (options?.isCalculation !== undefined) {
    params["filter.isCalculation"] = String(options.isCalculation);
  }
  if (options?.projectIds?.length) {
    options.projectIds.forEach((id, i) => {
      params[`filter.projectId[${i}]`] = String(id);
    });
  }
  if (options?.operationCategoryIds?.length) {
    options.operationCategoryIds.forEach((id, i) => {
      params[`filter.operationCategoryId[${i}]`] = String(id);
    });
  }
  return pfFetch<BizInfoByCategoryItem[]>(
    "/api/v1/bizinfos/incomeoutcomehistorybyoperationcategories",
    params,
  );
}

/** История поступлений/выплат по проектам */
export async function getBizInfoByProjects(
  startDate: string,
  endDate: string,
  options?: {
    isCalculation?: boolean;
    projectIds?: number[];
  },
) {
  const params: Record<string, string> = {
    "filter.periodStartDate": startDate,
    "filter.periodEndDate": endDate,
  };
  if (options?.isCalculation !== undefined) {
    params["filter.isCalculation"] = String(options.isCalculation);
  }
  if (options?.projectIds?.length) {
    options.projectIds.forEach((id, i) => {
      params[`filter.projectId[${i}]`] = String(id);
    });
  }
  return pfFetch<BizInfoByProjectItem[]>(
    "/api/v1/bizinfos/incomeoutcomehistorybyprojects",
    params,
  );
}

/** Список проектов */
export async function getProjects(options?: {
  active?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const params: Record<string, string> = {
    "paging.limit": String(options?.limit || 10000),
  };
  if (options?.active !== undefined) {
    params["filter.active"] = String(options.active);
  }
  if (options?.startDate) {
    params["filter.startDateTime"] = options.startDate;
  }
  if (options?.endDate) {
    params["filter.endDateTime"] = options.endDate;
  }
  return pfFetch<ProjectsResponse>("/api/v1/projects", params);
}

/** Список бюджетов */
export async function getBudgets(options?: { budgetMethod?: "Bdr" | "Bdds" }) {
  const params: Record<string, string> = {};
  if (options?.budgetMethod) {
    params["filter.budgetMethod"] = options.budgetMethod;
  }
  return pfFetch<BudgetsResponse>("/api/v1/budgets", params);
}

/** Детали бюджета */
export async function getBudgetDetail(budgetId: string) {
  return pfFetch<BudgetDetailResponse>(`/api/v1/budgets/${budgetId}`);
}

/** Список статей */
export async function getOperationCategories() {
  return pfFetch<OperationCategoriesResponse>("/api/v1/operationcategories");
}

/** Структура платежей (P&L агрегаты) */
export async function getPaymentStructure(
  startDate: string,
  endDate: string,
  categoryIds: number[],
  options?: { isCalculation?: boolean; standardPeriod?: "Day" | "Week" | "Month" | "Quarter" | "Year" },
) {
  const params: Record<string, string> = {
    "filter.periodStartDate": startDate,
    "filter.periodEndDate": endDate,
  };
  if (options?.isCalculation !== undefined) {
    params["filter.isCalculation"] = String(options.isCalculation);
  }
  if (options?.standardPeriod) {
    params["filter.standardPeriod"] = options.standardPeriod;
  }
  categoryIds.forEach((id, i) => {
    params[`filter.firstLevelOperationCategoryId[${i}]`] = String(id);
  });
  return pfFetch<PaymentStructureResponse>("/api/v1/businessmetrics/paymentstructure", params);
}

/** Список юрлиц (компаний) */
export async function getCompanies() {
  return pfFetch<CompaniesResponse>("/api/v1/companies");
}
