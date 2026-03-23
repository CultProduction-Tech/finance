/**
 * Клиент для AMO CRM API (только чтение)
 * Docs: https://www.amocrm.ru/developers/content/crm_platform/leads-api
 */

const BASE_URL = process.env.AMOCRM_BASE_URL || "";
const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN || "";
const PIPELINE_ID = Number(process.env.AMOCRM_PIPELINE_ID || "0");
const ACT_DATE_FIELD_ID = Number(process.env.AMOCRM_ACT_DATE_FIELD_ID || "0");
const PROJECT_STATUS_FIELD_ID = Number(process.env.AMOCRM_PROJECT_STATUS_FIELD_ID || "0");

// Статус "Продано" в AMO — стандартный id=142 (успешно реализовано)
const STATUS_SOLD = 142;
// "Проекты в работе" — значение кастомного поля "Статус проекта"
const PROJECT_STATUS_ACTIVE = "Идут работы";

interface AmoLead {
  id: number;
  name: string;
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

  if (!res.ok) {
    if (res.status === 204) return { _embedded: null } as T;
    throw new Error(`AMO CRM API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
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
