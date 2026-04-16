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
  const handleThisMonth = () => {
    const now = new Date();
    onYearChange(now.getFullYear());
    onStartMonthChange(now.getMonth());
    onEndMonthChange(now.getMonth());
  };

  const handleThisYear = () => {
    const now = new Date();
    onYearChange(now.getFullYear());
    onStartMonthChange(0);
    onEndMonthChange(11);
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const isThisMonth = year === currentYear && startMonth === currentMonth && endMonth === currentMonth;
  const isThisYear = year === currentYear && startMonth === 0 && endMonth === 11;

  const activeStyle = "rounded-full bg-[#1d1d1f] px-4 py-1.5 text-[13px] font-medium text-white transition-all";
  const inactiveStyle = "rounded-full bg-white/80 px-4 py-1.5 text-[13px] font-medium text-[#1d1d1f] hover:bg-white transition-all shadow-[0_1px_2px_rgba(0,0,0,0.06)]";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleThisMonth}
        className={isThisMonth ? activeStyle : inactiveStyle}
      >
        Этот месяц
      </button>
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
        <SelectTrigger className="w-[140px]">
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
        <SelectTrigger className="w-[140px]">
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
