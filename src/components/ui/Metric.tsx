import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

export type MetricTone = "default" | "positive" | "negative" | "caution" | "accent";

const toneClasses: Record<MetricTone, string> = {
  default: "text-ink",
  positive: "text-positive",
  negative: "text-negative",
  caution: "text-caution",
  accent: "text-accent-strong",
};

/**
 * Single data metric: label + numeric value + optional source badge.
 * Values are passed pre-formatted by callers — Metric never computes or invents data.
 */
export function Metric({
  label,
  value,
  tone = "default",
  source,
  loading = false,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: MetricTone;
  /** Provenance badge, e.g. "PHASE29" or a data-source label. */
  source?: string;
  loading?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)} title={hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
        {source ? <Badge variant="outline">{source}</Badge> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-24" />
      ) : (
        <div className={cn("numeric mt-1 truncate text-lg font-semibold", toneClasses[tone])}>
          {value}
        </div>
      )}
    </div>
  );
}

/** Responsive grid of Metric tiles. */
export function MetricGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const colClass =
    columns === 2
      ? "grid-cols-2"
      : columns === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2 sm:grid-cols-4";
  return <div className={cn("grid gap-x-4 gap-y-5", colClass, className)}>{children}</div>;
}
