export const TIMEFRAMES = ["1D", "4H", "1H", "15m"] as const;

import { cn } from "@/lib/cn";

/**
 * Timeframe selector (visual shell). A controlled radio group — real
 * behavior, no data dependency.
 */
export function TimeframeSelector({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (tf: string) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("inline-flex", className)}>
      <legend className="sr-only">Timeframe</legend>
      <div role="radiogroup" aria-label="Timeframe" className="flex overflow-hidden rounded-control border border-line-strong">
        {TIMEFRAMES.map((tf) => {
          const selected = value === tf;
          return (
            <button
              key={tf}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(tf)}
              className={cn(
                "min-h-11 min-w-11 px-3 text-xs font-semibold transition-colors",
                selected ? "bg-accent-dim text-accent-strong" : "bg-input text-muted hover:text-ink",
              )}
            >
              {tf}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
