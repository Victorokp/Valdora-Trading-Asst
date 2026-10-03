import type { MarketSessionStatus } from "@/domain/types";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const meta: Record<MarketSessionStatus, { label: string; variant: "positive" | "neutral" | "outline" }> = {
  OPEN: { label: "Market open", variant: "positive" },
  CLOSED: { label: "Market closed", variant: "neutral" },
  UNKNOWN: { label: "Session unknown", variant: "outline" },
};

/**
 * Market-session indicator. Text + dot; color is never the sole signal.
 */
export function MarketStatusIndicator({
  status,
  className,
}: {
  status: MarketSessionStatus;
  className?: string;
}) {
  const m = meta[status];
  return (
    <Badge variant={m.variant} className={className}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-pill",
          status === "OPEN" && "animate-pulse-dot bg-positive",
          status === "CLOSED" && "bg-muted",
          status === "UNKNOWN" && "bg-faint",
        )}
      />
      {m.label}
    </Badge>
  );
}
