/**
 * Data presentation formatters (32C design system "data styles").
 *
 * These helpers only format values that already exist. They never generate
 * financial values — callers pass real, sourced data or undefined.
 */

/** "1.1600" → "1.1600" — pass-through that guarantees string rendering. */
export function formatPrice(value: number | string | undefined): string {
  if (value === undefined) return "—";
  return typeof value === "string" ? value : String(value);
}

/** 0.18 → "+0.18%" · -0.4 → "-0.40%" · undefined → "—" (never fabricated). */
export function formatPercent(value: number | undefined, digits = 2): string {
  if (value === undefined) return "—";
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}%` : `${fixed}%`;
}

/** 1000 → "1,000.00" with currency prefix · undefined → "—". */
export function formatCurrency(value: number | undefined, currency = "USD"): string {
  if (value === undefined) return "—";
  const prefix = currency === "USD" ? "$" : `${currency} `;
  return `${prefix}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 1.5 → "+1.50R" · -2 → "-2.00R" · 0 → "0.00R" · undefined → "—". */
export function formatRMultiple(value: number | undefined, digits = 2): string {
  if (value === undefined) return "—";
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}R` : `${fixed}R`;
}

/** ISO-like timestamp → "2026-09-27 14:03 UTC" · undefined → "—". */
export function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

/** Uppercase badge text used consistently across status indicators. */
export function badgeText(text: string): string {
  return text.toUpperCase();
}
