/**
 * Trade lifecycle (32L) — deterministic helpers for the canonical flow:
 *
 *   Signal → Risk Evaluation → Planned Trade → User Decision →
 *   Execution Record → Executed Trade → Journal → Performance
 *
 * The engine NEVER executes and never fabricates an execution: creating an
 * ExecutedTrade requires the user's actual fill facts. The helpers here only
 * (a) derive a PlannedTrade record from a signal deterministically, and
 * (b) compute realized R from reported facts.
 *
 * Pure domain: no broker, no order placement, no I/O.
 */
import { asId, type PlannedTradeId } from "@/domain/ids";import type { PlannedTrade } from "@/domain/trading/trade";
import type { Signal } from "@/domain/signals/signal";
import type { TradeRiskEvaluation } from "@/domain/risk/engine";
import type { MarketTimestamp } from "@/domain/market/bar";

/** Derive the planned trade implied by a confirmed signal. Deterministic. */
export function plannedTradeFromSignal(input: {
  plannedId: PlannedTradeId;
  signal: Signal;
  risk: TradeRiskEvaluation;
  createdAt: MarketTimestamp;
  note?: string;
}): PlannedTrade {
  const { signal, risk, createdAt } = input;
  if (signal.intendedEntry.stopPrice === undefined || signal.intendedEntry.targetPrice === undefined) {
    throw new Error("a planned trade requires declared stop and target levels from the signal");
  }
  const stopPips = risk.stopDistancePips;
  const targetPips = risk.targetDistancePips;
  return {
    id: input.plannedId,
    instrument: signal.instrument,
    direction: signal.direction,
    signalId: signal.id,
    strategyVersionId: asId<"StrategyVersionId">(signal.strategyVersionId),
    intendedEntry: signal.intendedEntry.price ?? (signal.intendedEntry.stopPrice + signal.intendedEntry.targetPrice) / 2,
    stopPrice: signal.intendedEntry.stopPrice,
    targetPrice: signal.intendedEntry.targetPrice,
    riskReward:
      stopPips !== undefined && targetPips !== undefined && stopPips > 0 ? targetPips / stopPips : undefined,
    createdAt,
    note: input.note,
  };
}

/** Inputs for realized-R arithmetic — every value comes from a reported fill. */
export interface RealizedRInputs {
  readonly direction: "LONG" | "SHORT";
  readonly entry: number;
  readonly exit?: number;
  readonly stopPrice?: number;
  readonly pipSize?: number;
}

/**
 * Compute the realized R multiple from reported fill facts:
 * R = (exit − entry) / (entry − stop) for longs (mirrored for shorts).
 * `undefined` whenever any required fact is missing — never approximated.
 */
export function computeRealizedR(input: RealizedRInputs): number | undefined {
  const { direction, entry, exit, stopPrice, pipSize } = input;
  void pipSize;
  if (exit === undefined || stopPrice === undefined) return undefined;
  const riskUnits = direction === "LONG" ? entry - stopPrice : stopPrice - entry;
  const rewardUnits = direction === "LONG" ? exit - entry : entry - exit;
  if (riskUnits <= 0) return undefined;
  return rewardUnits / riskUnits;
}

/** Entry slippage in pips from intended and actual fills (positive = worse). */
export function entrySlippagePips(input: {
  direction: "LONG" | "SHORT";
  intendedEntry: number;
  actualEntry: number;
  pipSize: number;
}): number {
  const raw = input.direction === "LONG"
    ? input.actualEntry - input.intendedEntry
    : input.intendedEntry - input.actualEntry;
  return raw / input.pipSize;
}

/** Derive the next PlannedTradeId placeholder (deterministic caller-supplied scheme). */
export function nextPlannedTradeId(seed: string): PlannedTradeId {
  return asId<"PlannedTradeId">(`plan-${seed}`);
}
