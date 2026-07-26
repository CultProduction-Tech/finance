"use client";

import { Hint } from "@/components/ui/hint";

interface SourceMarkProps {
  /** Откуда плановые цифры графика */
  plan: string;
  /** Откуда фактические цифры графика */
  fact: string;
  /** Что стоит знать про источник (показывается в тултипе отдельным абзацем) */
  note?: string;
}

/**
 * Метка «откуда цифры» в углу карточки графика.
 *
 * Решение №1 созвона с Костей 21.07: «у каждого графика должна быть такая ссылка —
 * понятно, из какой таблицы взяты данные». Повод — показатели уравнения берутся
 * не оттуда, куда ведёт иконка таблицы в шапке: источники у графиков разные.
 */
export function SourceMark({ plan, fact, note }: SourceMarkProps) {
  return (
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
      <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground whitespace-nowrap hover:text-foreground transition-colors">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        источник
      </span>
    </Hint>
  );
}
