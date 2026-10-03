import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Meaningful empty state. Communicates why a surface is empty and what will
 * fill it — never fabricated demo data.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
  action,
  compact = false,
  className,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-control border border-dashed border-line bg-surface/40 text-center",
        compact ? "gap-1 px-4 py-6" : "gap-2 px-6 py-10",
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn("text-faint", compact ? "size-5" : "size-7")} />
      <p className={cn("font-medium text-ink-secondary", compact ? "text-sm" : "text-[15px]")}>
        {title}
      </p>
      {hint ? <p className="max-w-sm text-xs leading-relaxed text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
