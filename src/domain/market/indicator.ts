/**
 * Indicator values (32D).
 *
 * A generic typed representation of *calculated indicator results*. The
 * domain carries results and their provenance; calculation engines (EMA/ATR
 * implementations) arrive in later workstreams and are deliberately not
 * duplicated here — this layer contains no Golden-Reference strategy math.
 */
import type { Provenance } from "@/domain/provenance/provenance";
import type { Instrument } from "@/domain/instruments/instrument";
import type { MarketTimestamp } from "@/domain/market/bar";
import type { Timeframe } from "@/domain/market/timeframe";

/** Logical indicator names the application understands today. Extensible union. */
export type IndicatorName =
  | "EMA20"
  | "EMA50"
  | "ATR14"
  | "WEEKLY_EMA10"
  | "WEEKLY_EMA20"
  | "PRICE"
  | "CUSTOM";

/** A single calculated indicator value with full traceability. */
export interface IndicatorValue {
  readonly name: IndicatorName;
  /** Instrument the indicator was computed for. */
  readonly instrument: Instrument["symbol"];
  readonly timeframe: Timeframe;
  /** The value itself. `undefined` is allowed only as an explicit "not computed" — never silently. */
  readonly value?: number;
  /** Market time the value refers to (e.g. the bar it was computed on). */
  readonly asOf: MarketTimestamp;
  /** When the calculation was performed (may differ from `asOf`). */
  readonly calculatedAt?: string;
  /** Provenance of the inputs used for the calculation. */
  readonly provenance: Provenance;
  /** Declared parameters of the calculation (e.g. { span: 20 }). Metadata only. */
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
}

/** Convenience constructors keep call sites declarative and consistent. */
export function ema20(value: number | undefined, instrument: string, timeframe: Timeframe, asOf: MarketTimestamp, provenance: Provenance): IndicatorValue {
  return { name: "EMA20", instrument, timeframe, value, asOf, provenance, parameters: { span: 20 } };
}

export function ema50(value: number | undefined, instrument: string, timeframe: Timeframe, asOf: MarketTimestamp, provenance: Provenance): IndicatorValue {
  return { name: "EMA50", instrument, timeframe, value, asOf, provenance, parameters: { span: 50 } };
}

export function atr14(value: number | undefined, instrument: string, timeframe: Timeframe, asOf: MarketTimestamp, provenance: Provenance): IndicatorValue {
  return { name: "ATR14", instrument, timeframe, value, asOf, provenance, parameters: { period: 14 } };
}
