/**
 * Market snapshot (32D).
 *
 * Domain representation of current/observed market state. Contains only what
 * is genuinely known: any unavailable field stays `undefined`, and provenance
 * is explicit. The domain never fabricates prices — an absent price means
 * "not observed", never zero, never a guessed value.
 *
 * Two clocks are always distinguished (Part 1 §7):
 * - `observedAt`: the market time the observation refers to
 * - `receivedAt`: when the application received it (staleness = caller's derivation)
 */
import type { Provenance, Unprovenanced } from "@/domain/provenance/provenance";
import type { Instrument } from "@/domain/instruments/instrument";
import type { MarketTimestamp } from "@/domain/market/bar";
import type { MarketSessionStatus } from "@/domain/types";

/** Last-traded/last-observed price, if actually observed. */
export interface ObservedPrice {
  readonly value: number;
  readonly observedAt: MarketTimestamp;
}

/** Change relative to a reference (e.g. previous daily close), if computable. */
export interface DailyChange {
  /** Absolute change in price units. */
  readonly absolute: number;
  /** Relative change as a fraction (0.0018 = +0.18%). */
  readonly relative: number;
  /** What the change is measured against. */
  readonly reference: "PREVIOUS_CLOSE";
}

/** Quoted spread when the source provides one; pip conversion belongs to the app layer. */
export interface Spread {
  readonly absolute: number;
  /** Reference pip size used, when the source expressed the spread in pips. */
  readonly pips?: number;
}

/**
 * A point-in-time observation of market state. Every field except the
 * instrument is optional: unknown values remain unknown.
 */
export interface MarketSnapshot {
  readonly instrument: Instrument["symbol"];
  /** Market time the snapshot refers to (ISO-8601). */
  readonly observedAt?: MarketTimestamp;
  /** When the application received/recorded the snapshot (ISO-8601). */
  readonly receivedAt?: string;
  /** Last observed price, when actually observed. */
  readonly price?: ObservedPrice;
  readonly dailyChange?: DailyChange;
  readonly spread?: Spread;
  readonly marketStatus?: MarketSessionStatus;
  /** Where this snapshot came from. `UNPROVENANCED` is allowed but explicit. */
  readonly provenance: Provenance | Unprovenanced;
}
