/**
 * Клиент для AMO CRM API (только чтение)
 * Docs: https://www.amocrm.ru/developers/content/crm_platform/leads-api
 */

const BASE_URL = process.env.AMOCRM_BASE_URL || "";
const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN || "";
const PIPELINE_ID = Number(process.env.AMOCRM_PIPELINE_ID || "0");
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
    next: { revalidate: 300 },
  });

  if (res.status === 204) return { _embedded: null } as T;

  if (!res.ok) {
    throw new Error(`AMO CRM API error: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  if (!text) return { _embedded: null } as T;
  return JSON.parse(text);
}

/**
 * Количество проектов (сделок) в статусе "Продано" в воронке "Продакшн_Бластер",
 * у которых "Дата акта" попадает в указанный месяц.
 */
export async function getProjectsCount(startDate: string, endDate: string): Promise<number> {
  if (!BASE_URL || !ACCESS_TOKEN || !PIPELINE_ID) {
    return 0;
  }

  // AMO CRM фильтрует по статусам и воронке
  // Дату акта проверяем вручную (кастомные поля не поддерживают серверную фильтрацию по диапазону)
  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  let count = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      "filter[statuses][0][pipeline_id]": String(PIPELINE_ID),
      "filter[statuses][0][status_id]": String(STATUS_SOLD),
      limit: "250",
      page: String(page),
    });

    const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);

    if (!data._embedded?.leads?.length) {
      break;
    }

    for (const lead of data._embedded.leads) {
      // Фильтр: "Статус проекта" = "Идут работы"
      const projectStatusField = lead.custom_fields_values?.find(
        (f) => f.field_id === PROJECT_STATUS_FIELD_ID,
      );
      const projectStatus = projectStatusField?.values?.[0]?.value;
      if (projectStatus !== PROJECT_STATUS_ACTIVE) continue;

      // Фильтр: "Дата акта" в диапазоне
      const actDateField = lead.custom_fields_values?.find(
        (f) => f.field_id === ACT_DATE_FIELD_ID,
      );

      if (!actDateField?.values?.[0]?.value) continue;

      const actDateTs = Number(actDateField.values[0].value);
      if (actDateTs >= startTs && actDateTs <= endTs) {
        count++;
      }
    }

    hasMore = !!data._links?.next;
    page++;
  }

  return count;
}

/**
 * Список проектов с маржинальностью.
 * isPast=true → статус "Завершен", isPast=false → "Идут работы"
 */
export async function getProjectDetails(
  startDate: string,
  endDate: string,
  isPast: boolean,
): Promise<AmoProjectDetail[]> {
  if (!BASE_URL || !ACCESS_TOKEN || !PIPELINE_ID) {
    return [];
  }

  const requiredStatus = isPast ? PROJECT_STATUS_COMPLETED : PROJECT_STATUS_ACTIVE;
  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  const projects: AmoProjectDetail[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      "filter[statuses][0][pipeline_id]": String(PIPELINE_ID),
      "filter[statuses][0][status_id]": String(STATUS_SOLD),
      limit: "250",
      page: String(page),
    });

    const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);

    if (!data._embedded?.leads?.length) break;

    for (const lead of data._embedded.leads) {
      // Фильтр по статусу проекта
      const statusField = lead.custom_fields_values?.find(
        (f) => f.field_id === PROJECT_STATUS_FIELD_ID,
      );
      if (statusField?.values?.[0]?.value !== requiredStatus) continue;

      // Фильтр по дате акта
      const actDateField = lead.custom_fields_values?.find(
        (f) => f.field_id === ACT_DATE_FIELD_ID,
      );
      if (!actDateField?.values?.[0]?.value) continue;
      const actDateTs = Number(actDateField.values[0].value);
      if (actDateTs < startTs || actDateTs > endTs) continue;

      // Бюджет и план расходов
      const price = lead.price || 0;
      const expensePlanField = lead.custom_fields_values?.find(
        (f) => f.field_id === EXPENSE_PLAN_FIELD_ID,
      );
      const expensePlan = Number(expensePlanField?.values?.[0]?.value || 0);

      const marginPercent = price > 0
        ? Math.round(((price - expensePlan) / price) * 1000) / 10
        : 0;

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
 * Количество сделок «Продано» и «Не продано, проект закрыт» по дате создания.
 * Используется для расчёта Запросов и Конверсии в бизнес-уравнении.
 */
export async function getLeadCountsByCreatedDate(
  startDate: string,
  endDate: string,
): Promise<AmoLeadCounts> {
  if (!BASE_URL || !ACCESS_TOKEN || !PIPELINE_ID) {
    return { sold: 0, notSold: 0, soldTotalPrice: 0 };
  }

  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  let sold = 0;
  let notSold = 0;
  let soldTotalPrice = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      "filter[statuses][0][pipeline_id]": String(PIPELINE_ID),
      "filter[statuses][0][status_id]": String(STATUS_SOLD),
      "filter[statuses][1][pipeline_id]": String(PIPELINE_ID),
      "filter[statuses][1][status_id]": String(STATUS_NOT_SOLD),
      "filter[created_at][from]": String(startTs),
      "filter[created_at][to]": String(endTs),
      limit: "250",
      page: String(page),
    });

    const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);
    if (!data._embedded?.leads?.length) break;

    for (const lead of data._embedded.leads) {
      if (lead.pipeline_id !== PIPELINE_ID) continue;
      if (lead.status_id === STATUS_SOLD) {
        sold++;
        soldTotalPrice += lead.price || 0;
      } else if (lead.status_id === STATUS_NOT_SOLD) {
        notSold++;
      }
    }

    hasMore = !!data._links?.next;
    page++;
  }

  return { sold, notSold, soldTotalPrice };
}
