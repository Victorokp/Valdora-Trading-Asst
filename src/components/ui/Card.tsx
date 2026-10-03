import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Card surface (design-token: --color-card, border --color-line). */
export function Card({
  className,
  children,
  as: Tag = "section",
  "aria-label": ariaLabel,
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "article" | "div";
  "aria-label"?: string;
}) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-line bg-card shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        className,
      )}
      aria-label={ariaLabel}
    >
      {children}
    </Tag>
  );
}

/** Card header block: title + optional description and actions. */
export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-1 p-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-secondary">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-4 pt-0", className)}>{children}</div>;
}
