"use client";

import { MONTHS_RU } from "@/types/finance";
import { todayInBusinessTz } from "@/lib/timezone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PeriodSelectorProps {
  year: number;
  startMonth: number; // 0-based index
  endMonth: number;
  onYearChange: (year: number) => void;
  onStartMonthChange: (month: number) => void;
  onEndMonthChange: (month: number) => void;
  /** Скрыть селектор года (для компактного варианта) */
  hideYear?: boolean;
}

export function PeriodSelector({
  year,
  startMonth,
  endMonth,
  onYearChange,
  onStartMonthChange,
  onEndMonthChange,
  hideYear = false,
}: PeriodSelectorProps) {
  // Текущие год/месяц — по бизнес-TZ (Москва), как весь дашборд, не по TZ браузера
  const businessToday = todayInBusinessTz();
  const currentYear = parseInt(businessToday.slice(0, 4), 10);

  const isThisYear = year === currentYear && startMonth === 0 && endMonth === 11;

  const handleNIToggle = () => {
    if (isThisYear) {
      // Активный НИ → переключаем на текущий месяц
      const currentMonth = parseInt(businessToday.slice(5, 7), 10) - 1;
      onYearChange(currentYear);
      onStartMonthChange(currentMonth);
      onEndMonthChange(currentMonth);
    } else {
      // Неактивный → НИ за весь год
      onYearChange(currentYear);
      onStartMonthChange(0);
      onEndMonthChange(11);
    }
  };

  const pillBase = "inline-flex items-center justify-center rounded-full px-4 h-7 text-[13px] font-medium transition-all";
  const activeStyle = `${pillBase} bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.12)]`;
  const inactiveStyle = `${pillBase} bg-white text-[#1d1d1f] ring-1 ring-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:ring-black/[0.14] hover:shadow-[0_1px_3px_rgba(0,0,0,0.07)]`;

  // Если ни один пресет не активен — значит интервал кастомный, подсвечиваем дропдауны месяцев
  const isCustomInterval = !isThisYear;
  const monthAccent = isCustomInterval
    ? "bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] ring-0 shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:ring-0 hover:shadow-[0_1px_2px_rgba(0,0,0,0.12)] [&_svg]:text-[var(--accent-solid-foreground)]"
    : "";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleNIToggle}
        className={isThisYear ? activeStyle : inactiveStyle}
        title={isThisYear
          ? "НИ — накопительный итог: факт с начала года по активный месяц. Клик — переключиться на текущий месяц"
          : "НИ — накопительный итог: факт с начала года по активный месяц. Клик — включить"}
      >
        НИ
      </button>
      {!hideYear && (
        <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
          <SelectTrigger size="pill" className="w-[88px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2025">2025</SelectItem>
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2027">2027</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Select
        value={MONTHS_RU[startMonth]}
        onValueChange={(v) => {
          const idx = MONTHS_RU.indexOf(v as typeof MONTHS_RU[number]);
          if (idx === -1) return;
          onStartMonthChange(idx);
          if (idx > endMonth) onEndMonthChange(idx);
        }}
      >
        <SelectTrigger size="pill" className={`w-[124px] ${monthAccent}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS_RU.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-[#86868b] text-xs">—</span>

      <Select
        value={MONTHS_RU[endMonth]}
        onValueChange={(v) => {
          const idx = MONTHS_RU.indexOf(v as typeof MONTHS_RU[number]);
          if (idx === -1) return;
          onEndMonthChange(idx);
          if (idx < startMonth) onStartMonthChange(idx);
        }}
      >
        <SelectTrigger size="pill" className={`w-[124px] ${monthAccent}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS_RU.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
