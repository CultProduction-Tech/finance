import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <div
          className={cn(
            "text-2xl font-bold tracking-tight",
            variant === "negative" && "text-red-600",
            variant === "positive" && "text-emerald-600",
          )}
        >
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
