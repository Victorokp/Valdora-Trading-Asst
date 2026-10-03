/**
 * Signal model (32D).
 *
 * The canonical signal lifecycle. A signal is a traceable record of what the
 * strategy engine observed — creating one requires a strategy version, market
 * data provenance and evidence references. Nothing in this module generates
 * signals; that belongs to the (frozen-logic) strategy engine in a later
 * workstream.
 *
 * Banned labels ("guaranteed", "sure win", "risk-free", "strong buy",
 * "certain", "high confidence winner") are unrepresentable: the model carries
 * neutral states and factual fields only.
 */
import type { SignalId } from "@/domain/ids";
import type { Direction, MarketSessionStatus } from "@/domain/types";
import type { Instrument } from "@/domain/instruments/instrument";
import type { Provenance } from "@/domain/provenance/provenance";
import type { MarketTimestamp } from "@/domain/market/bar";
import type { Timeframe } from "@/domain/market/timeframe";
import type { Observation } from "@/domain/analysis/analysis";

/** The six canonical signal states (32D signal lifecycle). */
export const SIGNAL_STATES = [
  "NONE",
  "WATCH",
  "CANDIDATE",
  "CONFIRMED",
  "INVALIDATED",
  "EXPIRED",
] as const;
export type SignalState = (typeof SIGNAL_STATES)[number];

/** Why a signal left the active lifecycle (factual, neutral). */
export type TerminalSignalReason =
  | { readonly kind: "INVALIDATED"; readonly condition: string }
  | { readonly kind: "EXPIRED"; readonly at: MarketTimestamp };

/** The intended entry the strategy version defines (not an order). */
export interface IntendedEntry {
  /** Price level implied by the strategy (e.g. next-bar open assumption). */
  readonly price?: number;
  /** Entry timing semantics label from the strategy version, e.g. "NEXT_BAR_OPEN". */
  readonly timing: string;
  /** Stop level implied by the strategy, when defined. */
  readonly stopPrice?: number;
  /** Target level implied by the strategy, when defined. */
  readonly targetPrice?: number;
}

/** Execution-timing context the signal was created under (Phase-29-informed). */
export interface ExecutionTimingContext {
  /** Market time of signal detection. */
  readonly signalAt: MarketTimestamp;
  /** Intended entry time under the strategy's timing semantics. */
  readonly intendedEntryAt: MarketTimestamp;
  /** What the timing sensitivity research says, verbatim as limitation text. */
  readonly sensitivityNote: string;
  /** Session at signal time, when known. */
  readonly marketStatus?: MarketSessionStatus;
}

/**
 * The canonical signal. Immutable; carries everything needed to trace it:
 * instrument, timeframe, strategy/version, creation time, evidence, intent,
 * invalidation, expiry, timing context.
 */
export interface Signal {
  readonly id: SignalId;
  readonly instrument: Instrument["symbol"];
  readonly timeframe: Timeframe;
  readonly direction: Direction;
  readonly strategyId: string;
  readonly strategyVersionId: string;
  readonly createdAt: MarketTimestamp;
  /** References to the observations that grounded this signal. */
  readonly evidence: readonly Observation[];
  readonly intendedEntry: IntendedEntry;
  /** Factual condition that would invalidate the setup. */
  readonly invalidationCondition: string;
  /** When the signal ceases to be meaningful, when defined by the strategy. */
  readonly expiresAt?: MarketTimestamp;
  readonly timing: ExecutionTimingContext;
  /** Data provenance behind the signal (provider, timestamps, hashes). */
  readonly dataProvenance: Provenance;
}

/** A no-setup record: the engine evaluated and found nothing — a fact, not a signal. */
export interface NoSetup {
  readonly instrument: Instrument["symbol"];
  readonly timeframe: Timeframe;
  readonly evaluatedAt: MarketTimestamp;
  readonly strategyVersionId: string;
  readonly reason: string;
}
