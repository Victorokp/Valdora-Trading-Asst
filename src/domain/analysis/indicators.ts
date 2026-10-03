/**
 * Deterministic indicator mathematics (32I).
 *
 * Pure calculation primitives for the analysis engine. Every function is
 * deterministic (same input ⇒ same output), has no I/O, no wall clock and no
 * randomness. Values that cannot be computed from the available input are
 * returned as `undefined` — never interpolated, never fabricated.
 *
 * This is NOT a copy of the Golden Reference strategy: it is the generic
 * indicator vocabulary the analysis engine reports with. Strategy semantics
 * live in strategy-version configuration (see @/domain/strategy/rules).
 */
import type { MarketBar } from "@/domain/market/bar";

/**
 * Declared calculation conventions. Every analysis result cites this record
 * in its provenance/methodology so two results are always comparable.
 */
export const ANALYSIS_CONVENTIONS = {
  version: "valdora-analysis-v1",
  emaSeeding: "SMA_SEED",
  atrMethod: "WILDER",
  trueRangeFirstBar: "HIGH_MINUS_LOW",
  volatilityClassification: "ATR_WINDOW_PERCENTILE_Q25_Q75_Q90",
  minimumAtrObservations: 20,
  minimumBars: 64,
} as const;

/** Simple moving average; `undefined` until `period` observations exist. */
export function sma(values: readonly number[], period: number): readonly (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average with the standard SMA seed: the first `span`
 * values are `undefined`, the value at index `span-1` is the SMA of the
 * first `span` inputs, later values use the smoothing factor 2/(span+1).
 */
export function ema(values: readonly number[], span: number): readonly (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  if (span <= 0 || values.length < span) return out;
  const k = 2 / (span + 1);
  let seed = 0;
  for (let i = 0; i < span; i++) seed += values[i];
  out[span - 1] = seed / span;
  let prev = out[span - 1] as number;
  for (let i = span; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * True Range series. The first bar has no previous close, so its TR is the
 * declared convention HIGH_MINUS_LOW (documented in ANALYSIS_CONVENTIONS).
 */
export function trueRanges(bars: readonly Pick<MarketBar, "high" | "low" | "close">[]): readonly number[] {
  return bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prevClose = bars[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
  });
}

/**
 * Wilder ATR: the first ATR (index `period-1`) is the SMA of the first
 * `period` true ranges; later values are Wilder-smoothed recursively.
 * `undefined` before enough observations exist.
 */
export function wilderAtr(
  bars: readonly Pick<MarketBar, "high" | "low" | "close">[],
  period: number,
): readonly (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length).fill(undefined);
  if (period <= 0 || bars.length < period) return out;
  const trs = trueRanges(bars);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < bars.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Trailing rolling high over `window` bars ending at each index. */
export function rollingHighs(bars: readonly Pick<MarketBar, "high">[], window: number): readonly (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length).fill(undefined);
  if (window <= 0) return out;
  for (let i = 0; i < bars.length; i++) {
    if (i < window - 1) continue;
    let hi = -Infinity;
    for (let j = i - window + 1; j <= i; j++) hi = Math.max(hi, bars[j].high);
    out[i] = hi;
  }
  return out;
}

/** Trailing rolling low over `window` bars ending at each index. */
export function rollingLows(bars: readonly Pick<MarketBar, "low">[], window: number): readonly (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length).fill(undefined);
  if (window <= 0) return out;
  for (let i = 0; i < bars.length; i++) {
    if (i < window - 1) continue;
    let lo = Infinity;
    for (let j = i - window + 1; j <= i; j++) lo = Math.min(lo, bars[j].low);
    out[i] = lo;
  }
  return out;
}

/** Signed pip distance `(a − b) / pipSize` using the declared pip size. */
export function pipsBetween(a: number, b: number, pipSize: number): number {
  return (a - b) / pipSize;
}

/** Signed percentage distance of `a` relative to `b` (in %). */
export function percentDistance(a: number, b: number): number {
  return ((a - b) / b) * 100;
}
