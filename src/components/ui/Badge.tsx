import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "positive"
  | "negative"
  | "caution"
  | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-line-strong bg-surface text-ink-secondary",
  accent: "border-accent-dim bg-accent-dim/60 text-accent-strong",
  positive: "border-positive/30 bg-positive/10 text-positive",
  negative: "border-negative/30 bg-negative/10 text-negative",
  caution: "border-caution/30 bg-caution/10 text-caution",
  outline: "border-line-strong bg-transparent text-muted",
};

/**
 * Centralized badge vocabulary (Part 1 §19): status wording renders here so
 * banned words ("guaranteed", "sure win", "risk-free") literally cannot pass.
 */
export function Badge({
  children,
  variant = "neutral",
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
