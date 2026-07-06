const API_URL = process.env.PLANFACT_API_URL || "https://api.planfact.io";

const TTL_FRESH = 900;       // 15 минут — сегодняшние/будущие данные (могут меняться часто)
const TTL_CLOSED = 86_400;   // 24 часа — прошедшие дни (факт уже не меняется)

/**
 * Выбирает TTL кэша на основе параметров запроса PlanFact.
 * Конец периода / текущая дата строго раньше сегодняшнего дня — данные факта,
 * которые уже не изменятся: кэшируем на 24 часа. Иначе (сегодня/будущее/нет даты) — 15 минут.
 */
function planFactRevalidate(params?: Record<string, string>): number {
  if (!params) return TTL_CLOSED; // global data (категории, бюджеты-списки)
  const endStr = params["filter.periodEndDate"] || params["filter.currentDate"];
  if (!endStr) return TTL_CLOSED; // нет даты → справочные данные
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = new Date(endStr);
  return endDate < todayStart ? TTL_CLOSED : TTL_FRESH;
}

// ===== Семафор + дедуп параллельных запросов в PlanFact =====
// Тот же паттерн, что в amocrm-client: без него холодная загрузка дашборда
// (kpi × 3 периода + cashflow по дням) даёт залп из 100+ запросов и ловит 429.

const PF_MAX_CONCURRENT = 5;

let pfActive = 0;
const pfQueue: Array<() => void> = [];

function acquirePfSlot(): Promise<void> {
  return new Promise<void>((resolve) => {
    const tryRun = () => {
      if (pfActive < PF_MAX_CONCURRENT) {
        pfActive++;
        resolve();
      } else {
        pfQueue.push(tryRun);
      }
    };
    tryRun();
  });
}

function releasePfSlot() {
  pfActive--;
  const next = pfQueue.shift();
  if (next) next();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pfInflight = new Map<string, Promise<any>>();

interface PlanFactResponse<T> {
  data: T;
  isSuccess: boolean;
  errorMessage: string | null;
  errorCode: string | null;
}

function createPfFetch(apiKey: string) {
  return async function pfFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.append(key, value);
        }
      });
    }
    const urlStr = url.toString();

    // Дедуп: тот же URL уже в полёте (другой хук/пользователь) — отдаём тот же promise
    const dedupKey = `${apiKey.slice(-6)}:${urlStr}`;
    const existing = pfInflight.get(dedupKey);
    if (existing) return existing as Promise<T>;

    const p = (async (): Promise<T> => {
      await acquirePfSlot();
      try {
        const res = await fetch(urlStr, {
          headers: {
            "Content-Type": "application/json",
            "X-ApiKey": apiKey,
          },
          next: { revalidate: planFactRevalidate(params), tags: ["planfact"] },
        });

        if (!res.ok) {
          throw new Error(`PlanFact API error: ${res.status} ${res.statusText}`);
        }

        const json: PlanFactResponse<T> = await res.json();

        if (!json.isSuccess) {
          throw new Error(`PlanFact API: ${json.errorMessage || json.errorCode}`);
        }

        return json.data;
      } finally {
        releasePfSlot();
        pfInflight.delete(dedupKey);
      }
    })();

    pfInflight.set(dedupKey, p);
    return p;
  };
}


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
  budgetMethod: string;
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
  operationCategoryType: string;
  accountCategoryType: string;
  outcomeClassification: string;
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


export function createPlanFactClient(apiKey: string) {
  const pfFetch = createPfFetch(apiKey);

  return {
    async getAccountBalance(currentDate: string, accountIds?: number[]) {
      const params: Record<string, string> = {
        "filter.currentDate": currentDate,
      };
      if (accountIds?.length) {
        accountIds.forEach((id, i) => {
          params[`filter.accountIds[${i}]`] = String(id);
        });
      }
      return pfFetch<AccountBalanceResponse>("/api/v1/businessmetrics/accountbalance", params);
    },

    async getBudgets(options?: { budgetMethod?: "Bdr" | "Bdds" }) {
      const params: Record<string, string> = {};
      if (options?.budgetMethod) {
        params["filter.budgetMethod"] = options.budgetMethod;
      }
      return pfFetch<BudgetsResponse>("/api/v1/budgets", params);
    },

    async getBudgetDetail(budgetId: string) {
      return pfFetch<BudgetDetailResponse>(`/api/v1/budgets/${budgetId}`);
    },

    async getOperationCategories() {
      return pfFetch<OperationCategoriesResponse>("/api/v1/operationcategories");
    },

    async getPaymentStructure(
      startDate: string,
      endDate: string,
      categoryIds: number[],
      options?: { isCalculation?: boolean; standardPeriod?: "Day" | "Week" | "Month" | "Quarter" | "Year"; projectIds?: number[] },
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
      if (options?.projectIds?.length) {
        options.projectIds.forEach((id, i) => {
          params[`filter.projectId[${i}]`] = String(id);
        });
      }
      return pfFetch<PaymentStructureResponse>("/api/v1/businessmetrics/paymentstructure", params);
    },

    async getProjects(options?: { limit?: number }) {
      const params: Record<string, string> = {
        "paging.limit": String(options?.limit || 10000),
      };
      return pfFetch<ProjectsResponse>("/api/v1/projects", params);
    },

    async getCompanies() {
      return pfFetch<CompaniesResponse>("/api/v1/companies");
    },

    async getCashFlow(
      startDate: string,
      endDate: string,
      options?: { standardPeriod?: "Day" | "Week" | "Month" | "Quarter" | "Year" },
    ) {
      const params: Record<string, string> = {
        "filter.periodStartDate": startDate,
        "filter.periodEndDate": endDate,
      };
      if (options?.standardPeriod) {
        params["filter.standardPeriod"] = options.standardPeriod;
      }
      return pfFetch<CashFlowResponse>("/api/v1/businessmetrics/cashflow", params);
    },
  };
}

export type PlanFactClient = ReturnType<typeof createPlanFactClient>;
