import { BUSINESS_TZ, BUSINESS_TZ_OFFSET } from "@/lib/timezone";

const BASE_URL = process.env.AMOCRM_BASE_URL || "";
const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN || "";
const ACT_DATE_FIELD_ID = Number(process.env.AMOCRM_ACT_DATE_FIELD_ID || "0");

/** Границы дня в бизнес-TZ (Москва), в unix-секундах — для фильтров amoCRM */
function dayStartTs(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00${BUSINESS_TZ_OFFSET}`).getTime() / 1000);
}
function dayEndTs(date: string): number {
  return Math.floor(new Date(`${date}T23:59:59${BUSINESS_TZ_OFFSET}`).getTime() / 1000);
}

const EXPENSE_PLAN_FIELD_ID = 1647605;
const STATUS_SOLD = 142;

export interface AmoLeadCounts {
  /** Лиды в терминальных статусах (conversionSoldStatusIds — Реализовано + Закрыто и не реализ.) — знаменатель Винрейта */
  sold: number;
  totalRequests: number;
  /** Лиды в "победных" статусах (winStatusIds — Реализовано) по дате создания */
  wins: number;
}

export interface AmoProjectDetail {
  id: number;
  name: string;
  price: number;
  expensePlan: number;
  marginPercent: number;
  /** Заполнено ли поле «Бриф получен» (только если в конфиге задан briefDateFieldId).
   *  Сделка без него не попадает в brief-бакеты маржинальности Култа. */
  hasBrief?: boolean;
}

interface AmoLead {
  id: number;
  name: string;
  price: number;
  status_id: number;
  pipeline_id: number;
  closed_at: number | null;
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

// ===== Безопасность: семафор + дедуп параллельных запросов в AmoCRM =====
//
// Зачем:
// 1) Семафор — ограничивает количество ОДНОВРЕМЕННЫХ запросов в AmoCRM (макс. 4).
//    Даже если в коде запустилось 30 параллельных вызовов amoFetch, только 4 уходят в сеть.
//    Это страхует от burst >7 req/sec, за который AmoCRM банит.
// 2) Inflight-дедуп — если одновременно (например из разных вызовов /api/kpi) запросили
//    один и тот же URL, отправляем ОДИН реальный запрос, а оба promise'а получают тот же
//    результат. Это особенно важно когда дашборд открывают несколько пользователей сразу
//    или у нас несколько useKpi-хуков с одинаковыми параметрами.

const AMO_MAX_CONCURRENT = 4;

let amoActive = 0;
const amoQueue: Array<() => void> = [];

function acquireAmoSlot(): Promise<void> {
  return new Promise<void>((resolve) => {
    const tryRun = () => {
      if (amoActive < AMO_MAX_CONCURRENT) {
        amoActive++;
        resolve();
      } else {
        amoQueue.push(tryRun);
      }
    };
    tryRun();
  });
}

function releaseAmoSlot() {
  amoActive--;
  const next = amoQueue.shift();
  if (next) next();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const amoInflight = new Map<string, Promise<any>>();

async function amoFetch<T>(endpoint: string): Promise<T> {
  // Дедуп: один и тот же endpoint уже летит — отдаём тот же promise
  const existing = amoInflight.get(endpoint);
  if (existing) return existing as Promise<T>;

  const p = (async (): Promise<T> => {
    await acquireAmoSlot();
    try {
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
    } finally {
      releaseAmoSlot();
      amoInflight.delete(endpoint);
    }
  })();

  amoInflight.set(endpoint, p);
  return p;
}

export interface AmoConfig {
  pipelineId: number;
  projectStatusIds?: number[];
  marginFieldId?: number;
  conversionSoldStatusIds?: number[];
  /** Если задан — totalRequests считается только по этим статусам (вместо «все лиды воронки») */
  requestStatusIds?: number[];
  /** Статусы для "побед" — используется в getLeadCountsByCreatedDate (Янв-Мар) и getBlasterClosedLeadCounts (Апр+). Для Бластера: [Реализованo]. */
  winStatusIds?: number[];
  /** Custom-поле «Бриф получен» (для Запросов Бластера + bucketing проектов в графике маржинальности у Культа) */
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
    // fail loud: тихий return [] маскировал протухший токен нулями в дашборде
    throw new Error("amoCRM не сконфигурирован (AMOCRM_BASE_URL / ACCESS_TOKEN / PIPELINE_ID)");
  }

  const statusIds = config?.projectStatusIds ?? [STATUS_SOLD];

  const startTs = dayStartTs(startDate);
  const endTs = dayEndTs(endDate);

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
        hasBrief: config?.briefDateFieldId
          ? Boolean(
              lead.custom_fields_values?.find((f) => f.field_id === config.briefDateFieldId)
                ?.values?.[0]?.value,
            )
          : undefined,
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
  const requestStatusIds = config?.requestStatusIds;
  const winStatusIds = config?.winStatusIds;

  if (!BASE_URL || !ACCESS_TOKEN || !pipelineId) {
    throw new Error("amoCRM не сконфигурирован (AMOCRM_BASE_URL / ACCESS_TOKEN / PIPELINE_ID)");
  }

  const startTs = dayStartTs(startDate);
  const endTs = dayEndTs(endDate);

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
      soldIds.forEach((sid, i) => {
        params.set(`filter[statuses][${i}][pipeline_id]`, String(pipelineId));
        params.set(`filter[statuses][${i}][status_id]`, String(sid));
      });
      const data = await amoFetch<AmoLeadsResponse>(`/api/v4/leads?${params}`);
      if (!data._embedded?.leads?.length) break;
      for (const lead of data._embedded.leads) {
        if (lead.pipeline_id !== pipelineId) continue;
        if (soldIds.includes(lead.status_id)) {
          sold++;
        }
        if (winStatusIds?.includes(lead.status_id)) {
          wins++;
        }
      }
      hasMore = !!data._links?.next;
      page++;
    }
  }

  return { sold, totalRequests, wins };
}

/**
 * Месяц unix-ts в бизнес-TZ ("YYYY-MM"). НЕ в TZ сервера: прод живёт в UTC,
 * а date-поля amoCRM («Бриф получен») — полночь по Москве, т.е. 21:00 UTC
 * предыдущего дня. Серверный getMonth() уводил все брифы «1-го числа»
 * в предыдущий месяц. sv-SE даёт ISO-формат "YYYY-MM-DD".
 */
function toMonthKey(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("sv-SE", { timeZone: BUSINESS_TZ }).slice(0, 7);
}

/**
 * Подсчёт Запросов/Побед/Завершённых Бластера по месяцам.
 *
 * Источник даты — custom-поле "Бриф получен" в лиде. Лид попадает в месяц,
 * соответствующий значению поля. Лиды без заполненного поля не учитываются.
 *
 * Внутри месяца:
 *   requests  — все лиды в 6 целевых статусах
 *   wins      — подмножество, у которых текущий статус ∈ winStatusIds (Реализованo)
 *   completed — подмножество, у которых текущий статус ∈ conversionSoldStatusIds (Реализ. + Закрыто_не_реализ)
 *
 * ⚡ Запросов AmoCRM: ~10 (только пагинация всех лидов в 6 статусах).
 */
export type BlasterMonthlyCounts = { requests: number; wins: number; completed: number };

export async function getBlasterCountsByBriefField(
  config: AmoConfig,
): Promise<Record<string, BlasterMonthlyCounts>> {
  const pipelineId = config.pipelineId;
  const reqStatusIds = config.requestStatusIds ?? [];
  const winSet = new Set(config.winStatusIds ?? []);
  const completedSet = new Set(config.conversionSoldStatusIds ?? []);
  const briefFieldId = config.briefDateFieldId;

  if (!BASE_URL || !ACCESS_TOKEN || !pipelineId || !reqStatusIds.length || !briefFieldId) {
    throw new Error("amoCRM (Бластер) не сконфигурирован: нужны BASE_URL/TOKEN/PIPELINE + requestStatusIds + briefDateFieldId");
  }

  const buckets: Record<string, BlasterMonthlyCounts> = {};
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
      const f = l.custom_fields_values?.find((f) => f.field_id === briefFieldId);
      const v = f?.values?.[0]?.value;
      if (!v) continue;
      const monthKey = toMonthKey(Number(v));
      let b = buckets[monthKey];
      if (!b) {
        b = { requests: 0, wins: 0, completed: 0 };
        buckets[monthKey] = b;
      }
      b.requests++;
      if (winSet.has(l.status_id)) b.wins++;
      if (completedSet.has(l.status_id)) b.completed++;
    }
    hasMore = !!data._links?.next;
    page++;
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
    throw new Error("amoCRM (Култ) не сконфигурирован: нужны BASE_URL/TOKEN/PIPELINE + systemCreatedByUserId + primaryContactStatusId");
  }

  const startTs = dayStartTs(startDate);
  const endTs = dayEndTs(endDate);

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
