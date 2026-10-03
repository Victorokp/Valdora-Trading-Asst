import { INSTRUMENTS } from "@/data/instruments";
import { cn } from "@/lib/cn";

/**
 * Instrument selector (visual shell). The selectable instrument set comes from
 * the static catalog; no prices or market data are involved.
 */
export function InstrumentSelector({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (symbol: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-xs text-muted", className)}>
      <span>Instrument</span>
      <select
        className="min-h-11 rounded-control border border-line-strong bg-input px-3 py-2 text-sm text-ink"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {INSTRUMENTS.map((i) => (
          <option key={i.symbol} value={i.symbol}>
            {i.symbol}
          </option>
        ))}
      </select>
    </label>
  );
}
