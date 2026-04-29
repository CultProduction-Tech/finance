/**
 * Скелетоны для состояния загрузки. Повторяют структуру реальных
 * виджетов чтобы layout не прыгал при появлении данных.
 */

const cardClass =
  "rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]";
const pulse = "animate-pulse bg-black/[0.06]";

export function KpiCardSkeleton() {
  return (
    <div className={`${cardClass} px-4 py-3 flex items-center justify-between gap-3 h-[76px]`}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={`size-4 rounded ${pulse}`} />
        <div className={`h-3 w-16 rounded ${pulse}`} />
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <div className={`h-5 w-20 rounded ${pulse}`} />
        <div className={`h-3 w-28 rounded ${pulse}`} />
      </div>
    </div>
  );
}

interface ChartCardSkeletonProps {
  height?: number;
  /** Тип превью внутри: bar — столбцы, line — кривая */
  variant?: "bar" | "line";
}

export function ChartCardSkeleton({ height = 280, variant = "bar" }: ChartCardSkeletonProps) {
  return (
    <div className={`${cardClass} p-5`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className={`h-5 w-44 rounded ${pulse}`} />
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`h-6 w-12 rounded-full ${pulse}`} />
          <div className={`h-6 w-12 rounded-full ${pulse}`} />
          <div className={`h-6 w-14 rounded-full ${pulse}`} />
          <div className={`h-6 w-14 rounded-full ${pulse}`} />
        </div>
      </div>
      <div style={{ height }} className="flex items-end justify-around gap-2 pt-2">
        {variant === "bar"
          ? [55, 75, 45, 80, 60, 90, 50, 70].map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t ${pulse}`}
                style={{ height: `${h}%` }}
              />
            ))
          : (
            <div className="w-full h-full relative">
              <div className={`absolute inset-x-0 bottom-0 h-3/5 rounded ${pulse}`} />
            </div>
          )}
      </div>
    </div>
  );
}

export function PeriodSelectorSkeleton({ compact = false }: { compact?: boolean }) {
  // Лёгкая заглушка для верхней панели периода
  const w = compact ? "w-20" : "w-24";
  return (
    <div className="flex items-center gap-2">
      <div className={`h-7 w-12 rounded-full ${pulse}`} />
      {!compact && <div className={`h-7 w-20 rounded-full ${pulse}`} />}
      <div className={`h-7 ${w} rounded-full ${pulse}`} />
      <div className="text-[#86868b] text-xs">—</div>
      <div className={`h-7 ${w} rounded-full ${pulse}`} />
    </div>
  );
}
