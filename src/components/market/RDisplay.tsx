import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export type RDisplayVariant = "default" | "positive" | "negative";

/**
 * R-multiple display (visual shell). R-multiples are only ever rendered from
 * caller-supplied, sourced values — never fabricated or computed here.
 */
export function RDisplay({
  value,
  variant = "default",
  label,
  className,
}: {
  /** Pre-formatted R string (e.g. "+1.50R" or "—"). */
  value: string;
  variant?: RDisplayVariant;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "numeric inline-flex items-baseline gap-1.5 text-sm font-semibold",
        variant === "positive" && "text-positive",
        variant === "negative" && "text-negative",
        variant === "default" && "text-ink",
        className,
      )}
    >
      {label ? <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span> : null}
      {value}
    </span>
  );
}

/**
 * Provenance/source badge used on any research-derived figure (Part 1 §2:
 * every research-derived number carries a source badge).
 */
export function SourceBadge({ source, className }: { source: string; className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      {source}
    </Badge>
  );
}
