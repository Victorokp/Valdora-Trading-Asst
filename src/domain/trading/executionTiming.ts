/**
 * Execution timing domain (32D).
 *
 * Phase 29 measured material execution-timing sensitivity (control +32.2644R;
 * +1 bar ≈ +20.04R; +2 bars ≈ +2.00R). This model represents that structure —
 * signal time vs intended entry vs actual observed entry, delays, slippage —
 * so the application can *explain* timing sensitivity without converting the
 * research finding into a score and without ever labeling execution "robust".
 *
 * Pure domain: no research execution, no broker, no live pricing.
 */
import type { MarketTimestamp } from "@/domain/market/bar";
import type { Instrument } from "@/domain/instruments/instrument";

/** How an actual entry price came to be known. */
export type ExecutionSource =
  | "USER_REPORTED"
  | "BROKER_FILL_FUTURE"
  | "UNKNOWN";

/** Whether the intended-vs-actual comparison is meaningful yet. */
export type TimingStatus =
  | "AWAITING_ENTRY" // signal exists; entry not yet observed/reported
  | "ENTRY_ON_TIME"  // observed entry matches the intended timing semantics
  | "ENTRY_DELAYED"  // observed entry happened later than intended (bar or clock delay)
  | "UNKNOWN";       // insufficient information

/** The three timestamps that fully describe a signal-to-entry sequence. */
export interface TimingStamps {
  /** When the setup was detected by the strategy. */
  readonly signalAt: MarketTimestamp;
  /** When the order would be placed under the strategy's semantics. */
  readonly intendedEntryAt: MarketTimestamp;
  /** The actually observed/reported entry time, when known. Undefined = not known. */
  readonly actualEntryAt?: MarketTimestamp;
}

/** Delay between intended and actual entry, when both are known. */
export interface EntryDelay {
  /** Completed bars between intended and actual entry (when determinable). */
  readonly bars?: number;
  /** Clock-time delay (any duration string, e.g. ISO-8601). */
  readonly duration?: string;
}

/**
 * Full execution-timing record for one trade lifecycle. The domain does not
 * judge robustness: it records delays and slippage as measured/reported facts
 * and links the standing Phase-29 limitation verbatim.
 */
export interface ExecutionTiming {
  readonly instrument: Instrument["symbol"];
  readonly stamps: TimingStamps;
  readonly delay?: EntryDelay;
  /** Slippage as reported/measured, in pips (actual − expected). Positive = worse. */
  readonly slippagePips?: number;
  readonly source: ExecutionSource;
  readonly status: TimingStatus;
  /** Standing research limitation carried with every timing record. */
  readonly sensitivityNote: string;
}

/**
 * The standing limitation, as a constant: "robust to execution delay" is a
 * banned phrase; this note travels with any timing display.
 */
export const EXECUTION_SENSITIVITY_NOTE =
  "Historical research measured material sensitivity to execution delay. " +
  "Realized results may differ from backtested expectations.";

/** Derive the timing status from known stamps — factual only, no scoring. */
export function deriveTimingStatus(stamps: TimingStamps, delay?: EntryDelay): TimingStatus {
  if (stamps.actualEntryAt === undefined) return "AWAITING_ENTRY";
  if (delay === undefined) return "UNKNOWN";
  const delayed = (delay.bars !== undefined && delay.bars > 0) || delay.duration !== undefined;
  return delayed ? "ENTRY_DELAYED" : "ENTRY_ON_TIME";
}
