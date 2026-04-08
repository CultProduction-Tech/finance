import type { LegalEntity } from "@/types/finance";
import { createPlanFactClient } from "@/lib/planfact-client";
import type { AmoConfig } from "@/lib/amocrm-client";

interface EntityConfig {
  planfact: ReturnType<typeof createPlanFactClient>;
  amo: AmoConfig;
  budgetName: string;
  /** ID проектов PlanFact для исключения из P&L */
  excludeProjectIds?: number[];
}

const configs: Record<LegalEntity, EntityConfig> = {
  blaster: {
    planfact: createPlanFactClient(process.env.PLANFACT_API_KEY || ""),
    amo: {
      pipelineId: Number(process.env.AMOCRM_PIPELINE_ID || "0"),
      // Бластер: проекты = статус "Продажа" (84825134)
      projectStatusIds: [84825134],
      // Конверсия: Продажа + Закрыто и не реализовано (143)
      conversionSoldStatusId: 84825134,
      conversionNotSoldStatusId: 143,
    },
    budgetName: "Бюджет 26",
  },
  cult: {
    planfact: createPlanFactClient(process.env.PLANFACT_API_KEY_CULT || ""),
    amo: {
      pipelineId: Number(process.env.AMOCRM_PIPELINE_ID_CULT || "0"),
      projectStatusIds: [65069498, 65069502, 65069506, 65069510, 142],
      marginFieldId: 1569997, // "Маржа, руб"
    },
    budgetName: "Бюджет 2026",
    // Исключаем: Тех. отдел, СнупДок, Бурлеск, Не выбран
    excludeProjectIds: [1538920, 1736870, 1438093, 1438060],
  },
};

export function getEntityConfig(entity: LegalEntity): EntityConfig {
  return configs[entity];
}
