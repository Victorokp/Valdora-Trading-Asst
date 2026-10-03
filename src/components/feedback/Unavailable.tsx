import { CircleOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Unavailable state — clearly distinct from an error. Used when a feature or
 * data source is not connected yet (e.g. market data before 32D).
 */
export function UnavailableState({
  title = "Not available yet",
  message,
  icon: Icon = CircleOff,
  compact = false,
  className,
}: {
  title?: string;
  message?: string;
  icon?: LucideIcon;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-control border border-line bg-surface/40 px-5 text-center",
        compact ? "gap-1 py-5" : "gap-1.5 py-8",
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn("text-faint", compact ? "size-5" : "size-6")} />
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
      {message ? <p className="max-w-sm text-xs leading-relaxed text-muted">{message}</p> : null}
    </div>
  );
}
