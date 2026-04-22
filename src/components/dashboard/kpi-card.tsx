import { cn } from "@/lib/utils";

interface KpiCardProps {
  icon: string;
  label: string;
  value: string;
  subtitle?: string;
  variant?: "default" | "negative" | "positive";
}

export function KpiCard({ icon, label, value, subtitle, variant = "default" }: KpiCardProps) {
  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">{icon}</span>
        <span className="text-[13px] font-medium text-muted-foreground leading-tight whitespace-pre-line">{label}</span>
      </div>
      <div
        className={cn(
          "text-lg font-semibold tracking-tight shrink-0 tabular-nums",
          variant === "negative" && "text-[#ff3b30]",
          variant === "positive" && "text-[#34c759]",
        )}
      >
        {value}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}
