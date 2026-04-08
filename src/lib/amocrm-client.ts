/**
 * Клиент для AMO CRM API (только чтение)
 * Docs: https://www.amocrm.ru/developers/content/crm_platform/leads-api
 */

const BASE_URL = process.env.AMOCRM_BASE_URL || "";
const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN || "";
const ACT_DATE_FIELD_ID = Number(process.env.AMOCRM_ACT_DATE_FIELD_ID || "0");
const PROJECT_STATUS_FIELD_ID = Number(process.env.AMOCRM_PROJECT_STATUS_FIELD_ID || "0");

const EXPENSE_PLAN_FIELD_ID = 1647605;

// Статус "Продано" в AMO — стандартный id=142 (успешно реализовано)
const STATUS_SOLD = 142;
// Статус "Не продано, проект закрыт" — стандартный id=143
const STATUS_NOT_SOLD = 143;
// Значения кастомного поля "Статус проекта"
const PROJECT_STATUS_ACTIVE = "Идут работы";
const PROJECT_STATUS_COMPLETED = "Завершены";

export interface AmoLeadCounts {
  sold: number;
  notSold: number;
  soldTotalPrice: number;
  totalRequests: number;
}

export interface AmoProjectDetail {
  id: number;
  name: string;
  price: number;
  expensePlan: number;
  marginPercent: number;
}

interface AmoLead {
  id: number;
  name: string;
  price: number;
  status_id: number;
  pipeline_id: number;
  custom_fields_values: {
    field_id: number;
    field_name: string;
    values: { value: number | string }[];
  }[] | null;
}

interface AmoLeadsResponse {
  _embedded: {
    leads: AmoLead[];
  } | null;
  _page: number;
  _links: { next?: { href: string } };
}

async function amoFetch<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 900 },
  });

  if (res.status === 204) return { _embedded: null } as T;

  if (!res.ok) {
    throw new Error(`AMO CRM API error: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  if (!text) return { _embedded: null } as T;
  return JSON.parse(text);
}

export interface AmoConfig {
  pipelineId: number;
  /** Если задан — проекты фильтруются по этим status_id (вместо дефолтного STATUS_SOLD=142) */
  projectStatusIds?: number[];
  /** Если задан — маржинальность берётся из этого поля (абс. значение), иначе считается как price - expensePlan */
  marginFieldId?: number;
  /** Статус "успешная сделка" для конверсии (по умолчанию 142) */
  conversionSoldStatusId?: number;
  /** Статус "неуспешная сделка" для конверсии (по умолчанию 143) */
  conversionNotSoldStatusId?: number;
}

/**
 * Список проектов с маржинальностью.
 * Фильтр: статус сделки "Продано" + дата акта в диапазоне.
 */
export async function getProjectDetails(
  startDate: string,
  endDate: string,
  config?: AmoConfig,
): Promise<AmoProjectDetail[]> {
  const pipelineId = config?.pipelineId ?? Number(process.env.AMOCRM_PIPELINE_ID || "0");

  if (!BASE_URL || !ACCESS_TOKEN || !pipelineId) {
    return [];
  }

  // Если задан projectStatusIds — фильтруем по этим этапам, иначе дефолт STATUS_SOLD
  const statusIds = config?.projectStatusIds ?? [STATUS_SOLD];

  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  const projects: AmoProjectDetail[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ limit: "250", page: String(page) });
    statusIds.forEach((sid, i) => {
      params.set(`filter[statuses][${i}][pipeline_id]`, String(pipelineId));
      params.set(`filter[statuses][${i}][status_id]`, String(sid));
    });

    const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);

    if (!data._embedded?.leads?.length) break;

    for (const lead of data._embedded.leads) {
      // Фильтр по дате акта
      const actDateField = lead.custom_fields_values?.find(
        (f) => f.field_id === ACT_DATE_FIELD_ID,
      );
      if (!actDateField?.values?.[0]?.value) continue;
      const actDateTs = Number(actDateField.values[0].value);
      if (actDateTs < startTs || actDateTs > endTs) continue;

      const price = lead.price || 0;

      let expensePlan = 0;
      let marginPercent = 0;

      if (config?.marginFieldId) {
        // Маржа из кастомного поля (абс. значение в рублях)
        const marginField = lead.custom_fields_values?.find(
          (f) => f.field_id === config.marginFieldId,
        );
        const marginValue = Number(marginField?.values?.[0]?.value || 0);
        expensePlan = price - marginValue;
        marginPercent = price > 0
          ? Math.round((marginValue / price) * 1000) / 10
          : 0;
      } else {
        // План расходов → маржа = price - expensePlan
        const expensePlanField = lead.custom_fields_values?.find(
          (f) => f.field_id === EXPENSE_PLAN_FIELD_ID,
        );
        expensePlan = Number(expensePlanField?.values?.[0]?.value || 0);
        marginPercent = price > 0
          ? Math.round(((price - expensePlan) / price) * 1000) / 10
          : 0;
      }

      projects.push({
        id: lead.id,
        name: lead.name,
        price,
        expensePlan,
        marginPercent,
      });
    }

    hasMore = !!data._links?.next;
    page++;
  }

  return projects;
}

/**
 * Количество сделок по дате создания.
 * totalRequests — все лиды в воронке (все этапы).
 * sold/notSold — «Продано»/«Не продано, проект закрыт».
 */
export async function getLeadCountsByCreatedDate(
  startDate: string,
  endDate: string,
  config?: AmoConfig,
): Promise<AmoLeadCounts> {
  const pipelineId = config?.pipelineId ?? Number(process.env.AMOCRM_PIPELINE_ID || "0");
  const soldId = config?.conversionSoldStatusId ?? STATUS_SOLD;
  const notSoldId = config?.conversionNotSoldStatusId ?? STATUS_NOT_SOLD;

  if (!BASE_URL || !ACCESS_TOKEN || !pipelineId) {
    return { sold: 0, notSold: 0, soldTotalPrice: 0, totalRequests: 0 };
  }

  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  // 1) Все лиды в воронке за период (все этапы)
  let totalRequests = 0;
  {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({
        "filter[pipeline_id]": String(pipelineId),
        "filter[created_at][from]": String(startTs),
        "filter[created_at][to]": String(endTs),
        limit: "250",
        page: String(page),
      });
      const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);
      if (!data._embedded?.leads?.length) break;
      for (const lead of data._embedded.leads) {
        if (lead.pipeline_id === pipelineId) totalRequests++;
      }
      hasMore = !!data._links?.next;
      page++;
    }
  }

  // 2) Sold + Not Sold (для конверсии) — по дате закрытия
  let sold = 0;
  let notSold = 0;
  let soldTotalPrice = 0;
  {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({
        "filter[statuses][0][pipeline_id]": String(pipelineId),
        "filter[statuses][0][status_id]": String(soldId),
        "filter[statuses][1][pipeline_id]": String(pipelineId),
        "filter[statuses][1][status_id]": String(notSoldId),
        "filter[closed_at][from]": String(startTs),
        "filter[closed_at][to]": String(endTs),
        limit: "250",
        page: String(page),
      });
      const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);
      if (!data._embedded?.leads?.length) break;
      for (const lead of data._embedded.leads) {
        if (lead.pipeline_id !== pipelineId) continue;
        if (lead.status_id === soldId) {
          sold++;
          soldTotalPrice += lead.price || 0;
        } else if (lead.status_id === notSoldId) {
          notSold++;
        }
      }
      hasMore = !!data._links?.next;
      page++;
    }
  }

  return { sold, notSold, soldTotalPrice, totalRequests };
}
