"use client";

import { MONTHS_RU } from "@/types/finance";
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
}

export function PeriodSelector({
  year,
  startMonth,
  endMonth,
  onYearChange,
  onStartMonthChange,
  onEndMonthChange,
}: PeriodSelectorProps) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const isThisYear = year === currentYear && startMonth === 0 && endMonth === 11;

  const handleThisYear = () => {
    onYearChange(currentYear);
    onStartMonthChange(0);
    onEndMonthChange(11);
  };

  const activeStyle = "rounded-full bg-[var(--accent-solid)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-solid-foreground)] transition-all";
  const inactiveStyle = "rounded-full bg-white/80 px-4 py-1.5 text-[13px] font-medium text-[#1d1d1f] hover:bg-white transition-all shadow-[0_1px_2px_rgba(0,0,0,0.06)]";

  // Если ни один пресет не активен — значит интервал кастомный, подсвечиваем дропдауны месяцев
  const isCustomInterval = !isThisYear;
  const monthSelectClass = isCustomInterval
    ? "w-[140px] bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border-[var(--accent-solid)] [&_svg]:text-[var(--accent-solid-foreground)]"
    : "w-[140px]";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleThisYear}
        className={isThisYear ? activeStyle : inactiveStyle}
      >
        Этот год
      </button>
      <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
        <SelectTrigger className="w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="2025">2025</SelectItem>
          <SelectItem value="2026">2026</SelectItem>
          <SelectItem value="2027">2027</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={MONTHS_RU[startMonth]}
        onValueChange={(v) => {
          const idx = MONTHS_RU.indexOf(v as typeof MONTHS_RU[number]);
          if (idx === -1) return;
          onStartMonthChange(idx);
          if (idx > endMonth) onEndMonthChange(idx);
        }}
      >
        <SelectTrigger className={monthSelectClass}>
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

      <span className="text-muted-foreground">—</span>

      <Select
        value={MONTHS_RU[endMonth]}
        onValueChange={(v) => {
          const idx = MONTHS_RU.indexOf(v as typeof MONTHS_RU[number]);
          if (idx === -1) return;
          onEndMonthChange(idx);
          if (idx < startMonth) onStartMonthChange(idx);
        }}
      >
        <SelectTrigger className={monthSelectClass}>
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
