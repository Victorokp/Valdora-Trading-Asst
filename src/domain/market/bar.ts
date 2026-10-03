/**
 * Market-bar contract (32D).
 *
 * An immutable, normalized OHLC record. The domain validates only *impossible*
 * relationships (negative prices, high < low, open/close outside [low, high]).
 * It never fetches, loads or repairs market data, and never fabricates a bar.
 *
 * Timestamps are ISO-8601 strings. No timezone semantics beyond "as supplied"
 * — normalization to a project clock is a market-data-layer concern.
 */
import type { Instrument } from "@/domain/instruments/instrument";
import type { Timeframe } from "@/domain/market/timeframe";

/** ISO-8601 timestamp or date string of the bar's market time. */
export type MarketTimestamp = string;

/** A single normalized OHLC bar. All fields readonly. */
export interface MarketBar {
  readonly instrument: Instrument["symbol"];
  readonly timeframe: Timeframe;
  /** Market time the bar refers to (ISO-8601 date or timestamp). */
  readonly timestamp: MarketTimestamp;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Present only when the source provides it; never invented. */
  readonly volume?: number;
}

export type BarValidationProblem =
  | "NON_FINITE_PRICE"
  | "NEGATIVE_PRICE"
  | "HIGH_BELOW_LOW"
  | "OPEN_OUT_OF_RANGE"
  | "CLOSE_OUT_OF_RANGE"
  | "NEGATIVE_VOLUME"
  | "MISSING_TIMESTAMP";

const FINITE_GUARD = Number.isFinite;

function priceProblems(value: number): BarValidationProblem | null {
  if (!FINITE_GUARD(value)) return "NON_FINITE_PRICE";
  if (value < 0) return "NEGATIVE_PRICE";
  return null;
}

/**
 * Deterministic validation of impossible OHLC relationships.
 * Returns every violation found (empty array = structurally valid).
 * Ordering is stable so identical input always yields identical output.
 */
export function validateBar(bar: MarketBar): readonly BarValidationProblem[] {
  const problems: BarValidationProblem[] = [];
  let structuralProblem = false;
  if (bar.timestamp === "") {
    problems.push("MISSING_TIMESTAMP");
    structuralProblem = true;
  }

  for (const p of [bar.open, bar.high, bar.low, bar.close]) {
    const problem = priceProblems(p);
    if (problem) {
      problems.push(problem);
      structuralProblem = true;
      break; // one price-level problem is enough; relationship checks need numbers
    }
  }
  if (!structuralProblem) {
    if (bar.high < bar.low) problems.push("HIGH_BELOW_LOW");
    if (bar.open < bar.low || bar.open > bar.high) problems.push("OPEN_OUT_OF_RANGE");
    if (bar.close < bar.low || bar.close > bar.high) problems.push("CLOSE_OUT_OF_RANGE");
  }
  if (bar.volume !== undefined && (!FINITE_GUARD(bar.volume) || bar.volume < 0)) {
    problems.push("NEGATIVE_VOLUME");
  }
  return problems;
}

/** Type-guard helper: structurally valid bar. */
export function isValidBar(bar: MarketBar): boolean {
  return validateBar(bar).length === 0;
}
