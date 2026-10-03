/**
 * Trade journal domain (32D).
 *
 * A canonical trade record with a hard separation between a *planned* trade
 * (a hypothetical derived from a signal) and an *executed* trade (something
 * the user actually reports). The architecture never confuses the two: a
 * PlannedTrade cannot be aggregated into performance; only ExecutedTrade can.
 *
 * Pure domain: no persistence, no broker.
 */
import type { TradeId, PlannedTradeId, SignalId } from "@/domain/ids";
import type { Direction } from "@/domain/types";
import type { Instrument } from "@/domain/instruments/instrument";
import type { MarketTimestamp } from "@/domain/market/bar";
import type { ExecutionTiming } from "@/domain/trading/executionTiming";
import type { Provenance } from "@/domain/provenance/provenance";
import type { StrategyVersionId } from "@/domain/ids";

/** A hypothetical trade implied by a signal — never a real position. */
export interface PlannedTrade {
  readonly id: PlannedTradeId;
  readonly instrument: Instrument["symbol"];
  readonly direction: Direction;
  /** The signal this plan derives from. */
  readonly signalId: SignalId;
  readonly strategyVersionId: StrategyVersionId;
  readonly intendedEntry: number;
  readonly stopPrice: number;
  readonly targetPrice: number;
  /** Risk-reward ratio implied by the levels, when determinable. */
  readonly riskReward?: number;
  readonly createdAt: MarketTimestamp;
  readonly note?: string;
}

/** Trade lifecycle for executed trades. */
export const TRADE_OUTCOMES = ["OPEN", "STOP_OUT", "TARGET_HIT", "MANUAL_CLOSE", "EXPIRED"] as const;
export type TradeOutcome = (typeof TRADE_OUTCOMES)[number];

/** Fees/costs as recorded by the user or a future broker integration. */
export interface ExecutionCost {
  /** Commission or fees in quote-currency units, when known. */
  readonly fees?: number;
  /** Slippage in pips (positive = worse than intended). */
  readonly slippagePips?: number;
}

/**
 * An executed trade as the user reports it. Every numeric field is what
 * actually happened (or is unknown) — never a backtest value.
 */
export interface ExecutedTrade {
  readonly id: TradeId;
  readonly instrument: Instrument["symbol"];
  readonly direction: Direction;
  /** Signal reference, when the trade originated from one (manual trades have none). */
  readonly signalId?: SignalId;
  readonly strategyVersionId: StrategyVersionId;
  readonly entry: number;
  readonly stopPrice?: number;
  readonly targetPrice?: number;
  readonly exit?: number;
  readonly entryAt: MarketTimestamp;
  readonly exitAt?: MarketTimestamp;
  /** Realized R multiple; defined only for closed trades with a known stop distance. */
  readonly realizedR?: number;
  readonly timing: ExecutionTiming;
  readonly cost?: ExecutionCost;
  /** Where this record came from (user entry; a future broker adapter would extend this). */
  readonly provenance: Provenance;
  readonly notes?: string;
}
