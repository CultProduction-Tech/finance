import type { LegalEntity } from "@/types/finance";
import { createPlanFactClient } from "@/lib/planfact-client";
import type { AmoConfig } from "@/lib/amocrm-client";

interface BudgetVariant {
  /** Название бюджета в PlanFact (без учёта пробелов в начале/конце).
   *  В шапке дашборда показывается живой title найденного бюджета —
   *  это имя служит для поиска и как fallback, если бюджет пропал. */
  name: string;
  /** Стабильный ключ PlanFact — запасной путь, когда бюджет переименовали.
   *  Имя правят руками (и правят), budgetId не меняется никогда. Без него
   *  переименование обнуляло план и роняло дашборд в красный бейдж. */
  id?: string;
}

interface EntityConfig {
  planfact: ReturnType<typeof createPlanFactClient>;
  amo: AmoConfig;
  /** Бюджеты: old берётся для месяцев < cutoffMonth, new — для остальных. */
  budgets: {
    old: BudgetVariant;
    new: BudgetVariant;
    /** Граница "YYYY-MM" — с этого месяца включительно используется new */
    cutoffMonth: string;
  };
  excludeProjectIds?: number[];
}

const configs: Record<LegalEntity, EntityConfig> = {
  blaster: {
    planfact: createPlanFactClient(process.env.PLANFACT_API_KEY || ""),
    amo: {
      pipelineId: Number(process.env.AMOCRM_PIPELINE_ID || "0"),
      projectStatusIds: [84825134, 142],
      // Запросы — лиды, дошедшие хотя бы до "Брифа", т.е. эти 6 статусов:
      // Бриф передан в продакшн, Подготовка КП, Ждём ответа на КП, Продажа, Реализовано, Закрыто и не реализовано
      requestStatusIds: [83925498, 84825126, 84825130, 84825134, 142, 143],
      // Победы — Реализованo (используется closed_at, у Продажи его нет — она не терминальный статус)
      winStatusIds: [142],
      // Завершённые (знаменатель Винрейта) — Реализованo + Закрыто и не реализовано (оба терминальных)
      conversionSoldStatusIds: [142, 143],
      // Custom-поле "Бриф получен" — основной источник даты для Запросов
      briefDateFieldId: 1647617,
    },
    budgets: {
      old: { name: "Бюджет 26", id: "eba63c20-9e4d-49e6-bcc7-129047c71ef0" },
      // «Бюджет 3.0» — утверждён Костей (созвон 21.07.2026): прибыль ~474 тыс за год.
      // До 26.07 здесь стоял «02 Бюджет 26» (~3.66 млн) — расхождение, которое Костя заметил вживую.
      new: { name: "03 Бюджет 26", id: "f1afbd5f-2c6a-4e68-6a02-08dee664cf0f" },
      // С 2026-01 уже используем новый бюджет (старый остаётся в коде на случай отката).
      cutoffMonth: "2026-01",
    },
  },
  cult: {
    planfact: createPlanFactClient(process.env.PLANFACT_API_KEY_CULT || ""),
    amo: {
      pipelineId: Number(process.env.AMOCRM_PIPELINE_ID_CULT || "0"),
      projectStatusIds: [85003170, 85003174, 85003178, 85003182, 142],
      marginFieldId: 1569997,
      // Маржинальность Култа группируется по «Дате акта» (AMOCRM_ACT_DATE_FIELD_ID),
      // как у Бластера — briefDateFieldId здесь не нужен.
      systemCreatedByUserId: 8986330,
      primaryContactStatusId: 66787606,
      takenToWorkFieldId: 1567685,
      takenToWorkEnumId: 1796535,
    },
    budgets: {
      old: { name: "0 Бюджет 2026", id: "1096dbba-739b-4476-bf89-7d3d2ef380dc" },
      // «03 Бюджет 2026» — в PlanFact помечен «утверждено 04.08.2026», самый свежий из семейства.
      // До 26.07 тут стоял «01 Бюджет 2026», которого в PlanFact нет вообще → план май–дек был обнулён.
      // 04.08 команда завела бюджет заново под тем же именем, а прежний переименовала
      // в «03.0 Бюджет 2026 -первая версия»: поиск по имени увёл на новый, но id указывал
      // на июльскую версию — при следующем переименовании фолбэк вернул бы старые цифры.
      new: { name: "03 Бюджет 2026", id: "0f804f90-a37a-4a66-672e-08def2085a4b" },
      cutoffMonth: "2026-05",
    },
    excludeProjectIds: [1538920, 1736870, 1438093, 1438060],
  },
};

export function getEntityConfig(entity: LegalEntity): EntityConfig {
  return configs[entity];
}
