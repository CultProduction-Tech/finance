import type { LegalEntity } from "@/types/finance";
import { createPlanFactClient } from "@/lib/planfact-client";
import type { AmoConfig } from "@/lib/amocrm-client";

interface BudgetVariant {
  /** Название бюджета в PlanFact (без учёта пробелов в начале/конце) */
  name: string;
  /** Подпись для шапки дашборда */
  label: string;
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
      // Обработанные (для конверсии) — Продажа + Реализовано + Закрыто и не реализовано
      conversionSoldStatusIds: [84825134, 142, 143],
    },
    budgets: {
      old: { name: "Бюджет 26", label: "Бюджет v2 от 01.03.26" },
      new: { name: "02 Бюджет 26", label: "Бюджет v3 от 06.05.26" },
      cutoffMonth: "2026-05",
    },
  },
  cult: {
    planfact: createPlanFactClient(process.env.PLANFACT_API_KEY_CULT || ""),
    amo: {
      pipelineId: Number(process.env.AMOCRM_PIPELINE_ID_CULT || "0"),
      projectStatusIds: [85003170, 85003174, 85003178, 85003182, 142],
      marginFieldId: 1569997,
      briefDateFieldId: 1647617, // «Бриф получен» — используется для маржинальности
      systemCreatedByUserId: 8986330,
      primaryContactStatusId: 66787606,
      takenToWorkFieldId: 1567685,
      takenToWorkEnumId: 1796535,
    },
    budgets: {
      old: { name: "0 Бюджет 2026", label: "Бюджет конец 25 года" },
      new: { name: "01 Бюджет 2026", label: "Бюджет май 26 года" },
      cutoffMonth: "2026-05",
    },
    excludeProjectIds: [1538920, 1736870, 1438093, 1438060],
  },
};

export function getEntityConfig(entity: LegalEntity): EntityConfig {
  return configs[entity];
}
