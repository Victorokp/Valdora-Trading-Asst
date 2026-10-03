/**
 * Timeframe domain model (32D).
 *
 * Canonical timeframes as a closed set of named literals plus a bar-interval
 * concept so later intraday additions are additive. Daily and weekly are
 * required; intraday slots are declared but not yet registered with any
 * provider — the domain only defines the vocabulary.
 *
 * Pure domain: no data provider access.
 */

export const CANONICAL_TIMEFRAMES = ["DAILY", "WEEKLY", "H4", "H1", "M15"] as const;
export type Timeframe = (typeof CANONICAL_TIMEFRAMES)[number];

/** Timeframes the project registers today (others exist for forward extension). */
export const SUPPORTED_TIMEFRAMES: readonly Timeframe[] = ["DAILY", "WEEKLY"];

export type TimeframeCategory = "DAILY_OR_ABOVE" | "INTRADAY";

/** Category of a timeframe; intraday detection is structural, not a lookup gap. */
export function timeframeCategory(tf: Timeframe): TimeframeCategory {
  return tf === "DAILY" || tf === "WEEKLY" ? "DAILY_OR_ABOVE" : "INTRADAY";
}

/** Bar interval in seconds (informational; no provider semantics implied). */
export type BarIntervalSeconds = number;

export function barIntervalSeconds(tf: Timeframe): BarIntervalSeconds | null {
  switch (tf) {
    case "WEEKLY":
      return 7 * 24 * 60 * 60;
    case "DAILY":
      return 24 * 60 * 60;
    case "H4":
      return 4 * 60 * 60;
    case "H1":
      return 60 * 60;
    case "M15":
      return 15 * 60;
  }
}

export type TimeframeValidationFailure = "UNKNOWN_TIMEFRAME" | "UNSUPPORTED_TIMEFRAME";

export function isSupportedTimeframe(tf: Timeframe): boolean {
  return SUPPORTED_TIMEFRAMES.includes(tf);
}

export function validateTimeframe(value: string): { ok: true; timeframe: Timeframe } | { ok: false; reason: TimeframeValidationFailure } {
  if (!(CANONICAL_TIMEFRAMES as readonly string[]).includes(value)) {
    return { ok: false, reason: "UNKNOWN_TIMEFRAME" };
  }
  const tf = value as Timeframe;
  if (!isSupportedTimeframe(tf)) return { ok: false, reason: "UNSUPPORTED_TIMEFRAME" };
  return { ok: true, timeframe: tf };
}
