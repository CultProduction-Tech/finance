"use client";

import { Hint } from "@/components/ui/hint";
import { MONTHS_RU } from "@/types/finance";
import type { BudgetMeta } from "@/types/finance";

interface BudgetPassportProps {
  /** Подпись активного бюджета — дословный title из PlanFact */
  label: string;
  meta?: BudgetMeta;
}

/** "2026-01" → "Янв" */
function shortMonth(key: string): string {
  const idx = parseInt(key.slice(5, 7), 10) - 1;
  return MONTHS_RU[idx]?.slice(0, 3) ?? key;
}

/** "2026-01".."2026-04" → "Янв–Апр"; одинаковые → "Янв" */
function monthRange(from: string, to: string): string {
  return from === to ? shortMonth(from) : `${shortMonth(from)}–${shortMonth(to)}`;
}

/**
 * Паспорт плана: какой бюджет PlanFact даёт плановые цифры, когда его утвердили
 * и не появился ли в PlanFact бюджет новее.
 *
 * Зачем: имя бюджета зашито в конфиге строкой, поэтому новая утверждённая версия
 * проходит мимо дашборда молча — 21.07.2026 расхождение (3.7 млн против
 * утверждённых 474 тыс) заметил человек, а не система. Теперь замечает система.
 */
export function BudgetPassport({ label, meta }: BudgetPassportProps) {
  const parts = meta?.parts ?? [];
  const newer = meta?.newer;
  const renamed = meta?.renamed ?? [];
  const reused = meta?.reused ?? [];
  const isSplit = parts.length > 1;
  const attention = !!newer || renamed.length > 0 || reused.length > 0;

  const content = (
    <div className="space-y-1.5">
      {parts.length > 0 ? (
        parts.map((p) => (
          <div key={`${p.title}-${p.from}`}>
            <span className="font-medium text-[#1d1d1f]">«{p.title}»</span>
            {isSplit && <span> — {monthRange(p.from, p.to)}</span>}
            {p.description && (
              <div className="text-[11px] whitespace-pre-line">{p.description}</div>
            )}
          </div>
        ))
      ) : (
        <div>Бюджет не найден в PlanFact — плановые цифры показаны нулями.</div>
      )}

      {isSplit && (
        <div className="text-[11px] pt-1 border-t border-black/10">
          План периода собран из двух бюджетов: закрытые месяцы остаются на том, что действовал тогда.
        </div>
      )}

      {renamed.length > 0 && (
        <div className="pt-1.5 border-t border-black/10 text-amber-700">
          {renamed.map((r) => (
            <div key={r.was}>
              <span className="font-medium">Бюджет переименован: «{r.was}» → «{r.now}».</span>
            </div>
          ))}
          <div className="text-[11px]">
            Цифры верные — бюджет нашёлся по внутреннему ключу. Но в настройках дашборда осталось
            старое имя, стоит поправить.
          </div>
        </div>
      )}

      {reused.length > 0 && (
        <div className="pt-1.5 border-t border-black/10 text-amber-700">
          {reused.map((r) => (
            <div key={r.name}>
              <span className="font-medium">Бюджет «{r.name}» завели заново.</span>
              <div className="text-[11px]">
                {r.pinnedTitle
                  ? <>Прежняя версия теперь называется «{r.pinnedTitle}».</>
                  : <>Прежней версии в PlanFact больше нет.</>}
              </div>
            </div>
          ))}
          <div className="text-[11px]">
            Цифры верные — читаем тот бюджет, что так называется сейчас. Но внутренний ключ
            в настройках остался от прошлой версии: переименуют ещё раз — вернутся старые цифры.
          </div>
        </div>
      )}

      {newer && (
        <div className="pt-1.5 border-t border-black/10 text-amber-700">
          <span className="font-medium">В PlanFact есть бюджет новее: «{newer.title}».</span>
          {newer.description && (
            <div className="text-[11px] whitespace-pre-line">{newer.description}</div>
          )}
          <div className="text-[11px]">
            Дашборд его не читает — имя бюджета задано в настройках. Скажи, если переключить.
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Hint always side="bottom" title="План берётся из бюджета PlanFact" content={content}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] border transition-colors ${
          attention
            ? "bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-300"
            : "bg-black/[0.04] text-muted-foreground border-transparent hover:border-black/10 hover:text-foreground"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${attention ? "bg-amber-500" : "bg-emerald-500"}`}
          aria-hidden="true"
        />
        {label}
        {newer ? (
          <span className="font-medium">· есть новее</span>
        ) : renamed.length > 0 ? (
          <span className="font-medium">· переименован</span>
        ) : reused.length > 0 ? (
          <span className="font-medium">· заведён заново</span>
        ) : null}
      </span>
    </Hint>
  );
}
