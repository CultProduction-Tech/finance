"use client";

import { Fragment } from "react";
import { Hint } from "@/components/ui/hint";
import { LEGAL_ENTITIES, PLANFACT_APP_URL, type LegalEntity } from "@/types/finance";

/** Системы, в которые можно кликнуть с графика. */
type SourceSystem = "planfact" | "amo" | "sheet";

const SYSTEM_LABEL: Record<SourceSystem, string> = {
  planfact: "PlanFact",
  amo: "amoCRM",
  sheet: "таблица",
};

interface SourceMarkProps {
  /** Откуда плановые цифры графика */
  plan: string;
  /** Откуда фактические цифры графика */
  fact: string;
  /** Что стоит знать про источник (показывается в тултипе отдельным абзацем) */
  note?: string;
  /** Контур — из него берутся адреса воронки amoCRM и таблицы */
  entity?: LegalEntity;
  /** Системы, куда ведут ссылки рядом с меткой. Нерезолвимые молча отбрасываются */
  systems?: SourceSystem[];
}

/**
 * Метка «откуда цифры» в углу карточки графика.
 *
 * Решение №1 созвона с Костей 21.07: «у каждого графика должна быть такая ссылка —
 * понятно, из какой таблицы взяты данные», «если таблица — ссылку на таблицу,
 * если PlanFact — PlanFact». Поэтому метка не только объясняет, но и ведёт:
 * подсказка отвечает «откуда», ссылки — «где посмотреть и поправить».
 */
export function SourceMark({ plan, fact, note, entity, systems = [] }: SourceMarkProps) {
  const info = entity ? LEGAL_ENTITIES.find((e) => e.id === entity) : undefined;

  const hrefOf = (system: SourceSystem) => {
    if (system === "planfact") return PLANFACT_APP_URL;
    if (system === "amo") return info?.amoUrl;
    return info?.sheetUrl;
  };

  // Контур приходит не во все графики — ссылку без адреса не рисуем, а не даём битую
  const links = systems
    .map((system) => ({ label: SYSTEM_LABEL[system], href: hrefOf(system) }))
    .filter((link): link is { label: string; href: string } => !!link.href);

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground whitespace-nowrap">
      <Hint
        always
        side="bottom"
        title="Откуда цифры"
        content={
          <div className="space-y-1">
            <div>
              <span className="font-medium text-[#1d1d1f]">План:</span> {plan}
            </div>
            <div>
              <span className="font-medium text-[#1d1d1f]">Факт:</span> {fact}
            </div>
            {note && <div className="text-[11px] pt-1 border-t border-black/10">{note}</div>}
          </div>
        }
      >
        <span className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          {/* Со ссылками слово «источник» — лишняя ширина в тесной шапке:
              названия систем сами говорят, откуда цифры */}
          {links.length === 0 && "источник"}
        </span>
      </Hint>
      {links.map((link, i) => (
        <Fragment key={link.href}>
          {i > 0 && <span aria-hidden className="opacity-40">&middot;</span>}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
          >
            {link.label}&#x2197;
          </a>
        </Fragment>
      ))}
    </span>
  );
}
