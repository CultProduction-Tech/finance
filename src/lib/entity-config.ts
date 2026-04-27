import type { LegalEntity } from "@/types/finance";
import { createPlanFactClient } from "@/lib/planfact-client";
import type { AmoConfig } from "@/lib/amocrm-client";

interface EntityConfig {
  planfact: ReturnType<typeof createPlanFactClient>;
  amo: AmoConfig;
  budgetName: string;
  excludeProjectIds?: number[];
}

const configs: Record<LegalEntity, EntityConfig> = {
  blaster: {
    planfact: createPlanFactClient(process.env.PLANFACT_API_KEY || ""),
    amo: {
      pipelineId: Number(process.env.AMOCRM_PIPELINE_ID || "0"),
      projectStatusIds: [84825134, 142],
      conversionSoldStatusIds: [84825134, 142],
      conversionNotSoldStatusId: 143,
    },
    budgetName: "Бюджет 26",
  },
  cult: {
    planfact: createPlanFactClient(process.env.PLANFACT_API_KEY_CULT || ""),
    amo: {
      pipelineId: Number(process.env.AMOCRM_PIPELINE_ID_CULT || "0"),
      projectStatusIds: [85003170, 85003174, 85003178, 85003182, 142],
      marginFieldId: 1569997,
    },
    budgetName: "Бюджет 2026",
    excludeProjectIds: [1538920, 1736870, 1438093, 1438060],
  },
};

export function getEntityConfig(entity: LegalEntity): EntityConfig {
  return configs[entity];
}
