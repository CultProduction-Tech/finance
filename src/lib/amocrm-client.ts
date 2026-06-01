const BASE_URL = process.env.AMOCRM_BASE_URL || "";
const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN || "";
const ACT_DATE_FIELD_ID = Number(process.env.AMOCRM_ACT_DATE_FIELD_ID || "0");

const EXPENSE_PLAN_FIELD_ID = 1647605;
const STATUS_SOLD = 142;
const STATUS_NOT_SOLD = 143;

export interface AmoLeadCounts {
  sold: number;
  notSold: number;
  soldTotalPrice: number;
  totalRequests: number;
  /** Лиды в "победных" статусах (для Бластера — Продажа + Реализовано) по дате создания */
  wins: number;
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

const AMO_TTL_FRESH = 900;       // 15 минут
const AMO_TTL_CLOSED = 86_400;   // 24 часа для запросов по закрытым месяцам

/**
 * Если URL содержит фильтр filter[created_at][to] и эта дата < начала текущего месяца —
 * это запрос за закрытый период, кэшируем на 24ч. Иначе (текущий месяц / без даты) — 15 мин.
 */
function amoRevalidate(endpoint: string): number {
  const m = endpoint.match(/filter%5Bcreated_at%5D%5Bto%5D=(\d+)|filter\[created_at\]\[to\]=(\d+)/);
  const ts = m ? Number(m[1] || m[2]) : NaN;
  if (!Number.isFinite(ts) || ts === 0) return AMO_TTL_FRESH;
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(ts * 1000) < currentMonthStart ? AMO_TTL_CLOSED : AMO_TTL_FRESH;
}

async function amoFetch<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: amoRevalidate(endpoint), tags: ["amocrm"] },
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
  projectStatusIds?: number[];
  marginFieldId?: number;
  conversionSoldStatusIds?: number[];
  conversionNotSoldStatusId?: number;
  /** Если задан — totalRequests считается только по этим статусам (вместо «все лиды воронки») */
  requestStatusIds?: number[];
  /** Статусы для "побед" — отдельный счётчик в getLeadCountsByCreatedDate (для Бластера: Продажа + Реализовано) */
  winStatusIds?: number[];
  /** Статусы "входа" лида (Бластер: Бриф передан в продакшн). Используется для подсчёта запросов по дате перехода в этот статус. */
  requestEntryStatusIds?: number[];
  /** Custom-поле «Бриф получен» (для bucketing проектов в графике маржинальности у Культа) */
  briefDateFieldId?: number;
  /** Cult-specific: system user ID for counting requests */
  systemCreatedByUserId?: number;
  /** Cult-specific: "Первичный контакт" status ID */
  primaryContactStatusId?: number;
  /** Cult-specific: "Взяли в работу" custom field ID and enum value */
  takenToWorkFieldId?: number;
  takenToWorkEnumId?: number;
}

export type ProjectDateMode = "act" | "created" | "brief";

export async function getProjectDetails(
  startDate: string,
  endDate: string,
  config?: AmoConfig,
  dateMode: ProjectDateMode = "act",
): Promise<AmoProjectDetail[]> {
  const pipelineId = config?.pipelineId ?? Number(process.env.AMOCRM_PIPELINE_ID || "0");

  if (!BASE_URL || !ACCESS_TOKEN || !pipelineId) {
    return [];
  }

  const statusIds = config?.projectStatusIds ?? [STATUS_SOLD];

  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  const projects: AmoProjectDetail[] = [];
  let page = 1;
  let hasMore = true;

  // Какое поле использовать как дату для bucketing проектов по месяцу:
  //  - 'act'     — custom-поле «Дата акта» (исторический дефолт для Бластера)
  //  - 'created' — created_at лида (Культ, кол-во проектов)
  //  - 'brief'   — custom-поле «Бриф получен» (Культ, маржинальность)
  const briefFieldId = dateMode === "brief" ? config?.briefDateFieldId : undefined;

  while (hasMore) {
    const params = new URLSearchParams({ limit: "250", page: String(page) });
    statusIds.forEach((sid, i) => {
      params.set(`filter[statuses][${i}][pipeline_id]`, String(pipelineId));
      params.set(`filter[statuses][${i}][status_id]`, String(sid));
    });
    if (dateMode === "created") {
      params.set("filter[created_at][from]", String(startTs));
      params.set("filter[created_at][to]", String(endTs));
    }

    const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);

    if (!data._embedded?.leads?.length) break;

    for (const lead of data._embedded.leads) {
      if (dateMode === "act") {
        const actDateField = lead.custom_fields_values?.find(
          (f) => f.field_id === ACT_DATE_FIELD_ID,
        );
        if (!actDateField?.values?.[0]?.value) continue;
        const actDateTs = Number(actDateField.values[0].value);
        if (actDateTs < startTs || actDateTs > endTs) continue;
      } else if (dateMode === "brief") {
        if (!briefFieldId) continue;
        const briefField = lead.custom_fields_values?.find(
          (f) => f.field_id === briefFieldId,
        );
        if (!briefField?.values?.[0]?.value) continue;
        const briefTs = Number(briefField.values[0].value);
        if (briefTs < startTs || briefTs > endTs) continue;
      }
      // dateMode === 'created' — фильтр по created_at уже применён на серверной стороне

      const price = lead.price || 0;

      let expensePlan = 0;
      let marginPercent = 0;

      if (config?.marginFieldId) {
        const marginField = lead.custom_fields_values?.find(
          (f) => f.field_id === config.marginFieldId,
        );
        const marginValue = Number(marginField?.values?.[0]?.value || 0);
        expensePlan = price - marginValue;
        marginPercent = price > 0
          ? Math.round((marginValue / price) * 1000) / 10
          : 0;
      } else {
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

export async function getLeadCountsByCreatedDate(
  startDate: string,
  endDate: string,
  config?: AmoConfig,
): Promise<AmoLeadCounts> {
  const pipelineId = config?.pipelineId ?? Number(process.env.AMOCRM_PIPELINE_ID || "0");
  const soldIds = config?.conversionSoldStatusIds ?? [STATUS_SOLD];
  const notSoldId = config?.conversionNotSoldStatusId;
  const allStatusIds = notSoldId !== undefined ? [...soldIds, notSoldId] : [...soldIds];
  const requestStatusIds = config?.requestStatusIds;
  const winStatusIds = config?.winStatusIds;

  if (!BASE_URL || !ACCESS_TOKEN || !pipelineId) {
    return { sold: 0, notSold: 0, soldTotalPrice: 0, totalRequests: 0, wins: 0 };
  }

  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  let totalRequests = 0;
  {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({
        "filter[created_at][from]": String(startTs),
        "filter[created_at][to]": String(endTs),
        limit: "250",
        page: String(page),
      });
      if (requestStatusIds?.length) {
        // Фильтр по конкретным статусам воронки (учитывает только лиды, дошедшие до этих этапов)
        requestStatusIds.forEach((sid, i) => {
          params.set(`filter[statuses][${i}][pipeline_id]`, String(pipelineId));
          params.set(`filter[statuses][${i}][status_id]`, String(sid));
        });
      } else {
        // Без фильтра по статусам — все лиды воронки
        params.set("filter[pipeline_id]", String(pipelineId));
      }
      const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);
      if (!data._embedded?.leads?.length) break;
      for (const lead of data._embedded.leads) {
        if (lead.pipeline_id === pipelineId) totalRequests++;
      }
      hasMore = !!data._links?.next;
      page++;
    }
  }

  let sold = 0;
  let notSold = 0;
  let soldTotalPrice = 0;
  let wins = 0;
  {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({
        "filter[created_at][from]": String(startTs),
        "filter[created_at][to]": String(endTs),
        limit: "250",
        page: String(page),
      });
      allStatusIds.forEach((sid, i) => {
        params.set(`filter[statuses][${i}][pipeline_id]`, String(pipelineId));
        params.set(`filter[statuses][${i}][status_id]`, String(sid));
      });
      const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);
      if (!data._embedded?.leads?.length) break;
      for (const lead of data._embedded.leads) {
        if (lead.pipeline_id !== pipelineId) continue;
        if (soldIds.includes(lead.status_id)) {
          sold++;
          soldTotalPrice += lead.price || 0;
        } else if (notSoldId !== undefined && lead.status_id === notSoldId) {
          notSold++;
        }
        if (winStatusIds?.includes(lead.status_id)) {
          wins++;
        }
      }
      hasMore = !!data._links?.next;
      page++;
    }
  }

  return { sold, notSold, soldTotalPrice, totalRequests, wins };
}

interface AmoEventStatus {
  id: number;
  pipeline_id: number;
}

interface AmoEventValueItem {
  lead_status?: AmoEventStatus;
}

interface AmoEvent {
  entity_id: number;
  created_at: number;
  value_before?: AmoEventValueItem[] | null;
  value_after?: AmoEventValueItem[] | null;
}

interface AmoEventsResponse {
  _embedded: { events: AmoEvent[] } | null;
  _links: { next?: { href: string } };
}

/**
 * Гибридный подсчёт Запросов/Побед/Завершённых Бластера по "дате запроса" каждого лида.
 *
 * Дата запроса для лида определяется так:
 *   1) Если в AmoCRM есть событие смены этапа в requestEntryStatusIds (Бриф передан в продакшн)
 *      — берём дату самого раннего такого события
 *   2) Иначе если заполнено custom-поле briefDateFieldId (Бриф получен) — берём его
 *   3) Иначе лид не учитывается ни в одном из счётчиков
 *
 * Затем лиды бакетятся по месяцу даты запроса. В каждом месяце:
 *   - requests = все лиды этого месяца (статусы из requestStatusIds — 6 целевых)
 *   - wins     = подмножество, у которых текущий статус ∈ winStatusIds (Продажа + Реализовано)
 *   - completed= подмножество, у которых текущий статус ∈ conversionSoldStatusIds (3 финальных)
 */
export type BlasterMonthlyCounts = { requests: number; wins: number; completed: number };

export async function getBlasterCountsByBriefDate(
  startDate: string,
  endDate: string,
  config: AmoConfig,
): Promise<Record<string, BlasterMonthlyCounts>> {
  const pipelineId = config.pipelineId;
  const reqStatusIds = config.requestStatusIds ?? [];
  const entryStatusIds = config.requestEntryStatusIds ?? [];
  const winSet = new Set(config.winStatusIds ?? []);
  const completedSet = new Set(config.conversionSoldStatusIds ?? []);
  const briefFieldId = config.briefDateFieldId;

  if (!BASE_URL || !ACCESS_TOKEN || !pipelineId || !reqStatusIds.length) {
    return {};
  }

  // ===== 1. Все лиды воронки в 6 целевых статусах + custom-поле "Бриф получен" =====
  const leads: { id: number; status_id: number; fieldDate?: number }[] = [];
  {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({ limit: "250", page: String(page) });
      reqStatusIds.forEach((sid, i) => {
        params.set(`filter[statuses][${i}][pipeline_id]`, String(pipelineId));
        params.set(`filter[statuses][${i}][status_id]`, String(sid));
      });
      const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);
      const items = data._embedded?.leads;
      if (!items?.length) break;
      for (const l of items) {
        if (l.pipeline_id !== pipelineId) continue;
        let fieldDate: number | undefined;
        if (briefFieldId) {
          const f = l.custom_fields_values?.find((f) => f.field_id === briefFieldId);
          const v = f?.values?.[0]?.value;
          if (v) fieldDate = Number(v);
        }
        leads.push({ id: l.id, status_id: l.status_id, fieldDate });
      }
      hasMore = !!data._links?.next;
      page++;
    }
  }

  // ===== 2. События переходов в Бриф за выбранный период =====
  // Сервер фильтрует только по типу и дате; нужный target-статус мы отфильтруем локально.
  const eventDateByLead = new Map<number, number>();
  if (entryStatusIds.length) {
    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);
    const entrySet = new Set(entryStatusIds);
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({
        "filter[type]": "lead_status_changed",
        "filter[created_at][from]": String(startTs),
        "filter[created_at][to]": String(endTs),
        limit: "250",
        page: String(page),
      });
      const data = await amoFetch<AmoEventsResponse>(`/api/v4/events?${params}`);
      const events = data._embedded?.events;
      if (!events?.length) break;
      for (const ev of events) {
        const after = ev.value_after?.[0]?.lead_status;
        const before = ev.value_before?.[0]?.lead_status;
        if (!after || after.pipeline_id !== pipelineId) continue;
        if (!before || before.id === after.id) continue;
        if (!entrySet.has(after.id)) continue;
        const cur = eventDateByLead.get(ev.entity_id);
        if (cur === undefined || ev.created_at < cur) {
          eventDateByLead.set(ev.entity_id, ev.created_at);
        }
      }
      hasMore = !!data._links?.next;
      page++;
    }
  }

  // ===== 3. Бакетинг по месяцу "даты запроса" =====
  const buckets: Record<string, BlasterMonthlyCounts> = {};
  for (const lead of leads) {
    const ts = eventDateByLead.get(lead.id) ?? lead.fieldDate;
    if (!ts) continue;
    const d = new Date(ts * 1000);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let b = buckets[monthKey];
    if (!b) {
      b = { requests: 0, wins: 0, completed: 0 };
      buckets[monthKey] = b;
    }
    b.requests++;
    if (winSet.has(lead.status_id)) b.wins++;
    if (completedSet.has(lead.status_id)) b.completed++;
  }

  return buckets;
}

/**
 * Подсчёт запросов для Культа: лиды, созданные «Системой» в указанном периоде.
 * Возвращает общее количество и количество «взятых в работу» (ушедших из Первичного контакта).
 */
export async function getSystemCreatedLeadCounts(
  startDate: string,
  endDate: string,
  config: AmoConfig,
): Promise<{ totalRequests: number; takenToWork: number }> {
  const pipelineId = config.pipelineId;
  const createdByUserId = config.systemCreatedByUserId;
  const primaryContactStatusId = config.primaryContactStatusId;
  const takenFieldId = config.takenToWorkFieldId;
  const takenEnumId = config.takenToWorkEnumId;

  if (!BASE_URL || !ACCESS_TOKEN || !pipelineId || !createdByUserId || !primaryContactStatusId) {
    return { totalRequests: 0, takenToWork: 0 };
  }

  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  // Запросы: лиды от Системы, в "Первичный контакт", созданные в периоде
  // + считаем "взяли в работу" по кастомному полю
  let totalRequests = 0;
  let takenToWork = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      "filter[pipeline_id]": String(pipelineId),
      "filter[created_by]": String(createdByUserId),
      "filter[created_at][from]": String(startTs),
      "filter[created_at][to]": String(endTs),
      "filter[statuses][0][pipeline_id]": String(pipelineId),
      "filter[statuses][0][status_id]": String(primaryContactStatusId),
      limit: "250",
      page: String(page),
    });
    const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);
    if (!data._embedded?.leads?.length) break;
    for (const lead of data._embedded.leads) {
      if (lead.pipeline_id !== pipelineId) continue;
      totalRequests++;
      // Проверяем кастомное поле "Взяли в работу" = "Да"
      if (takenFieldId && takenEnumId && lead.custom_fields_values) {
        const field = lead.custom_fields_values.find((f) => f.field_id === takenFieldId);
        if (field?.values?.some((v) => v.value === "Да" || (v as { enum_id?: number }).enum_id === takenEnumId)) {
          takenToWork++;
        }
      }
    }
    hasMore = !!data._links?.next;
    page++;
  }

  return { totalRequests, takenToWork };
}
