/**
 * Analysis engine (32I) — deterministic market-structure analysis.
 *
 * Pure computation over validated, chronologically-sorted bars: indicator
 * series, observations (what was measured) and interpretations (what those
 * measurements may imply). The observation/interpretation separation from
 * 32D is preserved by construction: `observations` and `interpretations`
 * are separate arrays and interpretations are neutral, structured states.
 *
 * Every number is computed from the supplied bars with declared conventions
 * (ANALYSIS_CONVENTIONS). Nothing is fetched, nothing uses a wall clock, and
 * nothing is a prediction: "elevated volatility" describes measured history,
 * never a forecast.
 *
 * This module is NOT a copy of the Golden Reference strategy: it implements
 * the generic indicator/observation vocabulary the strategy engine (32J)
 * consumes.
 */
import type { Instrument } from "@/domain/instruments/instrument";
import type { MarketBar, MarketTimestamp } from "@/domain/market/bar";
import {
  ema,
  pipsBetween,
  percentDistance,
  wilderAtr,
  ANALYSIS_CONVENTIONS,
} from "@/domain/analysis/indicators";
import { ema20, ema50, atr14 } from "@/domain/market/indicator";
import type {
  IndicatorRelation,
  Interpretation,
  MarketCondition,
  MarketAnalysis,
  MomentumState,
  Observation,
  TrendDirection,
  VolatilityState,
} from "@/domain/analysis/analysis";
import type { Provenance } from "@/domain/provenance/provenance";
import type { Timeframe } from "@/domain/market/timeframe";

/** Declared deterministic thresholds for observation classification. */
export const ANALYSIS_THRESHOLDS = {
  /** |EMA20 − EMA50| relative to ATR14 above which structure reads TRENDING. */
  trendSeparationAtrMultiple: 0.5,
  /** |close − prevClose| relative to ATR14 below which momentum reads FLAT. */
  flatMomentumAtrMultiple: 0.05,
  /** ATR percentile bounds of the trailing classification window. */
  volatilityQuantiles: { low: 0.25, elevated: 0.75, high: 0.9 },
  /** Trailing ATR window used for volatility classification. */
  volatilityWindow: 100,
} as const;

/** Full indicator series the engine produces (aligned with the input bars). */
export interface AnalysisSeries {
  readonly ema20: readonly (number | undefined)[];
  readonly ema50: readonly (number | undefined)[];
  readonly atr14: readonly (number | undefined)[];
}

/** The complete, deterministic analysis computation output. */
export interface AnalysisResult extends MarketAnalysis {
  /** Indicator series aligned with the input bars (undefined before warm-up). */
  readonly series: AnalysisSeries;
  /** Latest computed indicator values (undefined while in warm-up). */
  readonly indicatorValues: readonly import("@/domain/market/indicator").IndicatorValue[];
  /** Latest bar the analysis refers to (same as `asOf`). */
  readonly evaluatedBar: MarketTimestamp;
  /** Number of bars the computation consumed. */
  readonly barCount: number;
  /** Declared calculation conventions/version stamp. */
  readonly conventions: typeof ANALYSIS_CONVENTIONS;
}

/** Deterministic quantile of a finite numeric sample (linear interpolation). */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
}

/** Classify the latest ATR against its trailing window (deterministic). */
function classifyVolatility(
  atrSeries: readonly (number | undefined)[],
  window: number,
): VolatilityState {
  const latest = atrSeries[atrSeries.length - 1];
  if (latest === undefined) return "UNDETERMINED";
  const trailing: number[] = [];
  for (let i = Math.max(0, atrSeries.length - window); i < atrSeries.length; i++) {
    const v = atrSeries[i];
    if (v !== undefined) trailing.push(v);
  }
  if (trailing.length < 20) return "UNDETERMINED"; // declared minimum window
  trailing.sort((a, b) => a - b);
  const q = ANALYSIS_THRESHOLDS.volatilityQuantiles;
  if (latest < quantile(trailing, q.low)) return "LOW";
  if (latest < quantile(trailing, q.elevated)) return "NORMAL";
  if (latest < quantile(trailing, q.high)) return "ELEVATED";
  return "HIGH";
}

function emaRelation(
  fast: number | undefined,
  slow: number | undefined,
  prevFast: number | undefined,
  prevSlow: number | undefined,
): IndicatorRelation {
  if (fast === undefined || slow === undefined) return "UNDETERMINED";
  if (fast === slow) return "EQUAL";
  const nowAbove = fast > slow;
  if (prevFast !== undefined && prevSlow !== undefined && prevFast !== prevSlow) {
    const prevAbove = prevFast > prevSlow;
    if (prevAbove !== nowAbove) return "CROSSING";
  }
  return nowAbove ? "ABOVE" : "BELOW";
}

/** How far price closed beyond its EMA, expressed in ATR multiples. */
function closeEmaGapAtr(close: number, emaValue: number | undefined, atr: number | undefined): number | undefined {
  if (emaValue === undefined || atr === undefined || atr <= 0) return undefined;
  return (close - emaValue) / atr;
}

/**
 * Compute the full analysis for one instrument/timeframe from validated
 * bars. Deterministic: identical inputs yield an identical result.
 * `undefined` indicator values inside the warm-up are handled explicitly —
 * affected observations report UNDETERMINED rather than guessing.
 */
export function computeAnalysis(input: {
  instrument: Instrument["symbol"];
  timeframe: Timeframe;
  bars: readonly MarketBar[];
  pipSize: number;
  dataProvenance: Provenance;
}): AnalysisResult {
  const { instrument, timeframe, bars, pipSize, dataProvenance } = input;
  const closes = bars.map((b) => b.close);
  const ema20Series = ema(closes, 20);
  const ema50Series = ema(closes, 50);
  const atrSeries = wilderAtr(bars, 14);

  const last = bars.length > 0 ? bars[bars.length - 1] : undefined;
  const prev = bars.length > 1 ? bars[bars.length - 2] : undefined;
  const asOf: MarketTimestamp = last?.timestamp ?? "";
  const e20 = ema20Series[ema20Series.length - 1];
  const e50 = ema50Series[ema50Series.length - 1];
  const atr = atrSeries[atrSeries.length - 1];
  const prevE20 = prev ? ema20Series[bars.length - 2] : undefined;
  const prevE50 = prev ? ema50Series[bars.length - 2] : undefined;

  const observations: Observation[] = [];
  const interpretations: Interpretation[] = [];

  // --- EMA relationship -----------------------------------------------------
  const relation = emaRelation(e20, e50, prevE20, prevE50);
  if (last && e20 !== undefined && e50 !== undefined) {
    observations.push({
      kind: "INDICATOR_RELATION",
      value: relation,
      left: ema20(e20, instrument, timeframe, asOf, dataProvenance),
      right: ema50(e50, instrument, timeframe, asOf, dataProvenance),
    });
  }

  // --- trend -----------------------------------------------------------------
  let trend: TrendDirection = "UNDETERMINED";
  if (last && e20 !== undefined && e50 !== undefined && atr !== undefined && atr > 0) {
    const separationAtr = Math.abs(e20 - e50) / atr;
    const aboveBoth = last.close > e20 && e20 > e50;
    const belowBoth = last.close < e20 && e20 < e50;
    if (separationAtr < ANALYSIS_THRESHOLDS.trendSeparationAtrMultiple) {
      trend = "SIDEWAYS";
    } else if (aboveBoth) {
      trend = "UP";
    } else if (belowBoth) {
      trend = "DOWN";
    } else {
      trend = relation === "ABOVE" ? "UP" : "DOWN";
    }
    observations.push({ kind: "TREND", value: trend, basis: [ema20(e20, instrument, timeframe, asOf, dataProvenance), ema50(e50, instrument, timeframe, asOf, dataProvenance), atr14(atr, instrument, timeframe, asOf, dataProvenance)] });
  } else if (last) {
    observations.push({ kind: "TREND", value: "UNDETERMINED", basis: [] });
  }

  // --- volatility -------------------------------------------------------------
  const volatility = classifyVolatility(atrSeries, ANALYSIS_THRESHOLDS.volatilityWindow);
  if (last) {
    observations.push({
      kind: "VOLATILITY",
      value: volatility,
      basis: atr !== undefined ? [atr14(atr, instrument, timeframe, asOf, dataProvenance)] : [],
    });
  }

  // --- momentum -----------------------------------------------------------------
  let momentum: MomentumState = "UNDETERMINED";
  if (last && prev && atr !== undefined && atr > 0) {
    const change = last.close - prev.close;
    if (Math.abs(change) < ANALYSIS_THRESHOLDS.flatMomentumAtrMultiple * atr) {
      momentum = "FLAT";
    } else {
      momentum = change > 0 ? "POSITIVE" : "NEGATIVE";
    }
    observations.push({
      kind: "MOMENTUM",
      value: momentum,
      basis: [atr14(atr, instrument, timeframe, asOf, dataProvenance)],
    });
  } else if (last) {
    observations.push({ kind: "MOMENTUM", value: "UNDETERMINED", basis: [] });
  }

  // --- market condition --------------------------------------------------------
  let condition: MarketCondition = "UNDETERMINED";
  if (trend === "UP" || trend === "DOWN") condition = "TRENDING";
  else if (trend === "SIDEWAYS") condition = "RANGING";
  else if (trend === "UNDETERMINED" && relation !== "UNDETERMINED") condition = "MIXED";
  if (last) {
    observations.push({ kind: "MARKET_CONDITION", value: condition, basis: [] });
  }

  // --- interpretations (neutral, clearly derived) --------------------------------
  if (trend === "UP") interpretations.push({ kind: "CONTEXT", label: "TREND_FAVORING_LONG_SIDE", basedOn: ["TREND", "INDICATOR_RELATION"] });
  else if (trend === "DOWN") interpretations.push({ kind: "CONTEXT", label: "TREND_FAVORING_SHORT_SIDE", basedOn: ["TREND", "INDICATOR_RELATION"] });
  else if (trend === "SIDEWAYS") interpretations.push({ kind: "CONTEXT", label: "NO_CLEAR_TREND", basedOn: ["TREND"] });

  if (last && e20 !== undefined && atr !== undefined && atr > 0) {
    const gapPips = pipsBetween(last.close, e20, pipSize);
    const gapPct = percentDistance(last.close, e20);
    interpretations.push({
      kind: "CONDITION_NOTE",
      note:
        `Close is ${gapPips >= 0 ? "+" : ""}${gapPips.toFixed(1)} pips (${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(2)}%) ` +
        `relative to EMA20; ATR14 measures ${atr.toFixed(Math.max(0, 4 - Math.floor(Math.log10(pipSize))))} price units.`,
    });
  }
  if (volatility === "ELEVATED" || volatility === "HIGH") {
    interpretations.push({
      kind: "CONDITION_NOTE",
      note: `Measured volatility (ATR14) is ${volatility.toLowerCase()} relative to its trailing window — a descriptive fact, not a forecast.`,
    });
  }
  if (bars.length < 64 || e50 === undefined || atr === undefined) {
    interpretations.push({
      kind: "UNCERTAINTY",
      reason:
        `Insufficient history for full indicator warm-up (${bars.length} bars available; ` +
        `${64} bars expected for EMA50/ATR14 conventions). Affected observations are UNDETERMINED.`,
    });
  }

  const indicatorValues = [
    ema20(e20, instrument, timeframe, asOf, dataProvenance),
    ema50(e50, instrument, timeframe, asOf, dataProvenance),
    atr14(atr, instrument, timeframe, asOf, dataProvenance),
  ];

  return {
    instrument,
    timeframe,
    asOf,
    observations,
    interpretations,
    dataProvenance,
    series: { ema20: ema20Series, ema50: ema50Series, atr14: atrSeries },
    indicatorValues,
    evaluatedBar: asOf,
    barCount: bars.length,
    conventions: { ...ANALYSIS_CONVENTIONS },
  };
}

/** Observable values keyed for the strategy-rule evaluator (32J). */
export function observationSetFromAnalysis(
  daily: AnalysisResult,
  bars: readonly MarketBar[],
): Record<string, number | undefined> {
  const last = bars[bars.length - 1];
  const e20 = daily.series.ema20[daily.series.ema20.length - 1];
  const e50 = daily.series.ema50[daily.series.ema50.length - 1];
  const atr = daily.series.atr14[daily.series.atr14.length - 1];
  return {
    close: last?.close,
    dailyLow: last?.low,
    dailyHigh: last?.high,
    dailyEma20: e20,
    dailyEma50: e50,
    dailyAtr14: atr,
  };
}

export function closeEmaGapHelper(close: number, emaValue: number | undefined, atr: number | undefined): number | undefined {
  return closeEmaGapAtr(close, emaValue, atr);
}
