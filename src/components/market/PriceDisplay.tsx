import { cn } from "@/lib/cn";

/**
 * Price display (visual shell). Renders a caller-supplied price string or a
 * "—" placeholder when no data is connected. Never generates a value.
 */
export function PriceDisplay({
  label = "Price",
  value,
  changePercent,
  className,
}: {
  label?: string;
  /** Pre-formatted price string from the data layer; undefined → em dash. */
  value?: string;
  /** Pre-formatted, signed percentage string; undefined → em dash. */
  changePercent?: string;
  className?: string;
}) {
  const unavailable = value === undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
      {unavailable ? (
        <div className="numeric mt-1 text-2xl text-faint">—</div>
      ) : (
        <div className="numeric mt-1 text-2xl font-semibold text-ink">{value}</div>
      )}
      <div className="numeric mt-0.5 text-sm">
        {changePercent ?? <span className="text-faint">—</span>}
      </div>
    </div>
  );
}
