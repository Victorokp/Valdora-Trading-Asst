/**
 * Signal engine (32J) — deterministic signal-state derivation.
 *
 * Maps a rule-evaluation trace + market context onto the canonical six-state
 * lifecycle (NONE → WATCH → CANDIDATE → CONFIRMED, terminal
 * INVALIDATED/EXPIRED). It does not invent states, does not persist anything,
 * and never executes. The lifecycle → validity bridge (`lifecycleToValidity`)
 * remains the authoritative display mapping — this engine produces a
 * `SignalState` only.
 *
 * State derivation is a pure function of declared facts:
 * - any entry rule UNAVAILABLE (warm-up / missing data) → NONE with a reason
 * - any invalidation rule FAIL → INVALIDATED
 * - all entry rules PASS → CONFIRMED
 * - some entry rules PASS, none FAIL → CANDIDATE
 * - first rule PASS, none FAIL → WATCH
 * - otherwise → NONE
 *
 * Pure domain: no I/O, no clock, no market access.
 */
import type { SignalId, StrategyId, StrategyVersionId } from "@/domain/ids";
import type { Signal, SignalState, IntendedEntry, ExecutionTimingContext } from "@/domain/signals/signal";
import { EXECUTION_SENSITIVITY_NOTE } from "@/domain/trading/executionTiming";
import type { Direction } from "@/domain/types";
import type { MarketTimestamp, MarketBar } from "@/domain/market/bar";
import type { Timeframe } from "@/domain/market/timeframe";
import type { Provenance } from "@/domain/provenance/provenance";
import type { AnalysisResult } from "@/domain/analysis/engine";
import type { Observation } from "@/domain/analysis/analysis";
import type { StrategyRuleSet, RuleEvaluationTrace } from "@/domain/strategy/rules";

/**
 * The deterministic lifecycle derivation. `trace` and `rules` are supplied by
 * the strategy engine; the derivation itself is total and side-effect free.
 */
export function deriveSignalState(trace: RuleEvaluationTrace): SignalState {
  if (trace.anyInvalidationTriggered) return "INVALIDATED";
  if (trace.allConditionsPassed) return "CONFIRMED";
  const entryOutcomes = trace.entryTraces.map((t) => t.outcome);
  if (entryOutcomes.length === 0) return "NONE";
  if (entryOutcomes.includes("UNAVAILABLE")) return "NONE"; // warm-up/missing data is not a setup
  const passed = entryOutcomes.filter((o) => o === "PASS").length;
  if (passed === 0) return "NONE";
  if (passed === entryOutcomes.length) return "CONFIRMED"; // unreachable given allConditionsPassed, kept total
  if (passed === 1) return "WATCH";
  return "CANDIDATE";
}

/** A neutral reason accompanying a derived state (factual, never loaded). */
export function stateRationale(trace: RuleEvaluationTrace, state: SignalState): string {
  switch (state) {
    case "CONFIRMED":
      return `All ${trace.entryTraces.length} entry rules passed at ${trace.evaluatedAt}.`;
    case "CANDIDATE": {
      const passed = trace.entryTraces.filter((t) => t.outcome === "PASS").length;
      return `${passed} of ${trace.entryTraces.length} entry rules passed; setup forming.`;
    }
    case "WATCH": {
      const passed = trace.entryTraces.filter((t) => t.outcome === "PASS").length;
      return `${passed} of ${trace.entryTraces.length} entry rules passed; watching for the remainder.`;
    }
    case "INVALIDATED": {
      const failed = trace.invalidationTraces.filter((t) => t.outcome === "FAIL");
      return failed.length > 0
        ? `Invalidation condition met: ${failed[0]?.ruleLabel ?? "declared condition"}.`
        : "Invalidation condition met.";
    }
    case "NONE":
      return trace.unavailableKeys.length > 0
        ? `No setup — some observations unavailable (${trace.unavailableKeys.join(", ")}).`
        : "No setup — entry rules not passed.";
    case "EXPIRED":
      return "Signal window elapsed.";
  }
}

/**
 * Build a full, traceable Signal record from engine outputs. This is record
 * CONSTRUCTION, not signal generation: nothing here runs on a schedule,
 * contacts a provider, or places anything. The intended entry/stop/target
 * levels are copied from the rule set's declared exit plan applied to the
 * analysis facts (deterministic arithmetic only).
 */
export function buildSignal(input: {
  id: SignalId;
  strategyId: StrategyId;
  version: { versionId: StrategyVersionId };
  rules: StrategyRuleSet;
  trace: RuleEvaluationTrace;
  state: SignalState;
  analysis: AnalysisResult;
  bars: readonly MarketBar[];
  timeframe: Timeframe;
  dataProvenance: Provenance;
  observedPipSize: number;
  signalAt: MarketTimestamp;
  intendedEntryAt: MarketTimestamp;
}): Signal {
  const { rules, analysis, bars, observedPipSize } = input;
  const last = bars.length > 0 ? bars[bars.length - 1] : undefined;
  const atr = analysis.series.atr14[analysis.series.atr14.length - 1];
  const stopMultiple = rules.exitPlan?.stopAtrMultiple;
  const targetMultiple = rules.exitPlan?.targetAtrMultiple;
  const entryTiming = "NEXT_BAR_OPEN";

  const intendedEntry: IntendedEntry = {
    timing: entryTiming,
    ...(last && stopMultiple !== undefined && atr !== undefined
      ? { stopPrice: rules.direction === "LONG" ? last.close - stopMultiple * atr : last.close + stopMultiple * atr }
      : {}),
    ...(last && targetMultiple !== undefined && atr !== undefined
      ? { targetPrice: rules.direction === "LONG" ? last.close + targetMultiple * atr : last.close - targetMultiple * atr }
      : {}),
  };
  void observedPipSize;

  const timing: ExecutionTimingContext = {
    signalAt: input.signalAt,
    intendedEntryAt: input.intendedEntryAt,
    sensitivityNote: EXECUTION_SENSITIVITY_NOTE,
  };

  // Evidence = the analysis observations that grounded the evaluation.
  const evidence: readonly Observation[] = analysis.observations;

  return {
    id: input.id,
    instrument: analysis.instrument,
    timeframe: input.timeframe,
    direction: rules.direction,
    strategyId: input.strategyId,
    strategyVersionId: input.version.versionId,
    createdAt: input.signalAt,
    evidence,
    intendedEntry,
    invalidationCondition:
      rules.invalidationRules.map((r) => r.label).join("; ") || "declared invalidation conditions",
    timing,
    dataProvenance: input.dataProvenance,
  };
}

/** Derive direction-typed helpers for display layers. */
export function signalDirectionLabel(direction: Direction): string {
  return direction === "LONG" ? "Long setup" : "Short setup";
}
