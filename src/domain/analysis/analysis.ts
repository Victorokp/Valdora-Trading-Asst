/**
 * Analysis domain model (32D).
 *
 * Separates what the system *measured* (observations) from what an analysis
 * service *says it may imply* (interpretations). Interpretations are neutral,
 * structured states — never trading signals, never recommendations, and never
 * loaded labels ("guaranteed", "strong buy", "certain", "high confidence
 * winner" are unrepresentable here by construction).
 *
 * Pure domain: no engines, no indicator math, no provider calls.
 */
import type { Instrument } from "@/domain/instruments/instrument";
import type { Provenance } from "@/domain/provenance/provenance";
import type { MarketTimestamp } from "@/domain/market/bar";
import type { Timeframe } from "@/domain/market/timeframe";
import type { IndicatorValue } from "@/domain/market/indicator";

/** Neutral trend observation states. */
export type TrendDirection = "UP" | "DOWN" | "SIDEWAYS" | "UNDETERMINED";

/** Neutral volatility observation states. */
export type VolatilityState = "LOW" | "NORMAL" | "ELEVATED" | "HIGH" | "UNDETERMINED";

/** Neutral momentum observation states. */
export type MomentumState = "POSITIVE" | "NEGATIVE" | "FLAT" | "UNDETERMINED";

/** Range/trend condition of the observed market structure. */
export type MarketCondition = "TRENDING" | "RANGING" | "MIXED" | "UNDETERMINED";

/** Relationship between two referenced indicators (e.g. EMA20 vs EMA50). */
export type IndicatorRelation = "ABOVE" | "BELOW" | "CROSSING" | "EQUAL" | "UNDETERMINED";

/** One measured fact. Each observation carries what was measured and how. */
export type Observation =
  | { readonly kind: "TREND"; readonly value: TrendDirection; readonly basis: readonly IndicatorValue[] }
  | { readonly kind: "VOLATILITY"; readonly value: VolatilityState; readonly basis: readonly IndicatorValue[] }
  | { readonly kind: "MOMENTUM"; readonly value: MomentumState; readonly basis: readonly IndicatorValue[] }
  | { readonly kind: "MARKET_CONDITION"; readonly value: MarketCondition; readonly basis: readonly IndicatorValue[] }
  | {
      readonly kind: "INDICATOR_RELATION";
      readonly value: IndicatorRelation;
      readonly left: IndicatorValue;
      readonly right: IndicatorValue;
    };

/** Neutral interpretation of observations. Descriptive framing only. */
export type Interpretation =
  | { readonly kind: "CONTEXT"; readonly label: "TREND_FAVORING_LONG_SIDE" | "TREND_FAVORING_SHORT_SIDE" | "NO_CLEAR_TREND"; readonly basedOn: readonly Observation["kind"][] }
  | { readonly kind: "CONDITION_NOTE"; readonly note: string }
  | { readonly kind: "UNCERTAINTY"; readonly reason: string };

/**
 * A structured analysis result for one instrument/timeframe at one market
 * time. Observations and interpretations are separate arrays by construction.
 */
export interface MarketAnalysis {
  readonly instrument: Instrument["symbol"];
  readonly timeframe: Timeframe;
  /** Market time the analysis refers to. */
  readonly asOf: MarketTimestamp;
  /** What the system measured. */
  readonly observations: readonly Observation[];
  /** What those measurements may imply — never a trading signal. */
  readonly interpretations: readonly Interpretation[];
  /** Provenance of the market data the analysis was computed from. */
  readonly dataProvenance: Provenance;
}
