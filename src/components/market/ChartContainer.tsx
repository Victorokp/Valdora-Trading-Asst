import { CandlestickChart } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

/**
 * Chart container (visual shell). Real charts arrive with the market-data
 * layer (32D) using the same normalized feed as analysis — never a second
 * divergent source (Part 2 §23).
 */
export function ChartContainer({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-card border border-line bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-secondary">
          {title}
        </h3>
        {meta ? <Badge variant="outline">{meta}</Badge> : null}
      </div>
      {children ?? (
        <div className="page-grid flex aspect-[16/7] min-h-[160px] flex-col items-center justify-center gap-2 text-center">
          <CandlestickChart aria-hidden="true" className="size-7 text-faint" />
          <p className="max-w-xs px-4 text-xs leading-relaxed text-muted">
            No market data connected yet. The chart activates with the market-data layer.
          </p>
        </div>
      )}
    </div>
  );
}
