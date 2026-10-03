/**
 * Strategy rule evaluation (32J).
 *
 * Rules and conditions are CONFIGURATION DATA on a strategy version; the
 * evaluator compares declared conditions against observed values supplied by
 * the analysis engine (32I) and emits a full trace. The evaluator never
 * computes market data itself, never invents an observation, and never
 * produces a trading recommendation — it reports rule outcomes as facts.
 *
 * Pure domain: no I/O, no clock, no market access.
 */
import type { StrategyVersion } from "@/domain/strategy/strategy";
import type { MarketTimestamp } from "@/domain/market/bar";
import type { Provenance } from "@/domain/provenance/provenance";
import type { Direction } from "@/domain/types";
import type { AnalysisResult } from "@/domain/analysis/engine";

/** Operators the rule evaluator understands. Closed, deterministic set. */
export const RULE_OPERATORS = [
  "GT",
  "GTE",
  "LT",
  "LTE",
  "EQ",
  "NEQ",
  "CROSSES_ABOVE",
  "CROSSES_BELOW",
] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

/**
 * Typed keys of the observation set the analysis engine supplies. Kept as a
 * closed union so a rule can only reference facts the engine actually
 * produces — never an invented observation.
 */
export type ObservationKey =
  | "close"
  | "dailyLow"
  | "dailyHigh"
  | "dailyEma20"
  | "dailyEma50"
  | "dailyAtr14"
  | "prevClose"
  | "prevEma20"
  | "prevEma50";

/** One declared condition: observed <operator> threshold (or key). */
export interface RuleCondition {
  readonly key: ObservationKey;
  readonly operator: RuleOperator;
  /** Numeric threshold, when the comparison is against a constant. */
  readonly threshold?: number;
  /** Alternative comparison key, when comparing two observations. */
  readonly thresholdKey?: ObservationKey;
  /** Human-readable restatement of the condition (shown in the trace). */
  readonly expected: string;
}

/** One named rule = an ordered conjunction of conditions. */
export interface StrategyRule {
  readonly id: string;
  readonly label: string;
  readonly conditions: readonly RuleCondition[];
  /** What the rule measures, in one factual sentence. */
  readonly description?: string;
}

/** The declared rule set of a strategy version (direction-gated). */
export interface StrategyRuleSet {
  readonly direction: Direction;
  readonly entryRules: readonly StrategyRule[];
  /** Invalidation conditions evaluated on every subsequent bar. */
  readonly invalidationRules: readonly StrategyRule[];
  /** Exit declaration (informational metadata; the app never auto-executes). */
  readonly exitPlan?: {
    readonly stopAtrMultiple?: number;
    readonly targetAtrMultiple?: number;
    readonly description: string;
  };
}

/**
 * Evaluation of a single condition: PASS / FAIL / UNAVAILABLE.
 * UNAVAILABLE means the referenced observation does not exist (warm-up,
 * missing data) — never coerced into FAIL and never into PASS.
 */
export type ConditionOutcome = "PASS" | "FAIL" | "UNAVAILABLE";

export interface ConditionTrace {
  readonly ruleId: string;
  readonly ruleLabel: string;
  readonly key: ObservationKey;
  readonly operator: RuleOperator;
  /** Observed value when it existed; `undefined` otherwise. */
  readonly observed?: number;
  /** The compared threshold (resolved constant or key), when known. */
  readonly expectedValue?: number;
  readonly expected: string;
  readonly outcome: ConditionOutcome;
}

export interface RuleTrace {
  readonly ruleId: string;
  readonly ruleLabel: string;
  readonly outcome: ConditionOutcome;
  readonly conditions: readonly ConditionTrace[];
}

/** Full deterministic evaluation trace for one evaluation. */
export interface RuleEvaluationTrace {
  readonly direction: Direction;
  readonly strategyVersionId: string;
  readonly evaluatedAt: MarketTimestamp;
  readonly entryTraces: readonly RuleTrace[];
  readonly invalidationTraces: readonly RuleTrace[];
  /** Facts about availability gaps discovered during evaluation. */
  readonly unavailableKeys: readonly ObservationKey[];
  readonly allConditionsPassed: boolean;
  readonly anyInvalidationTriggered: boolean;
}

/** The typed observation set the evaluator reads (never computes). */
export type ObservationSet = Record<ObservationKey, number | undefined>;

/** Extract the typed observation set from an analysis result + its bars. */
export function observationSetFrom(
  analysis: AnalysisResult,
  bars: readonly { close: number; low: number; high: number }[],
): ObservationSet {
  const last = bars.length > 0 ? bars[bars.length - 1] : undefined;
  const prev = bars.length > 1 ? bars[bars.length - 2] : undefined;
  const prevIdx = bars.length - 2;
  return {
    close: last?.close,
    dailyLow: last?.low,
    dailyHigh: last?.high,
    dailyEma20: analysis.series.ema20[analysis.series.ema20.length - 1],
    dailyEma50: analysis.series.ema50[analysis.series.ema50.length - 1],
    dailyAtr14: analysis.series.atr14[analysis.series.atr14.length - 1],
    prevClose: prev?.close,
    prevEma20: prevIdx >= 0 ? analysis.series.ema20[prevIdx] : undefined,
    prevEma50: prevIdx >= 0 ? analysis.series.ema50[prevIdx] : undefined,
  };
}

function compare(operator: RuleOperator, observed: number, expected: number): boolean {
  switch (operator) {
    case "GT":
      return observed > expected;
    case "GTE":
      return observed >= expected;
    case "LT":
      return observed < expected;
    case "LTE":
      return observed <= expected;
    case "EQ":
      return observed === expected;
    case "NEQ":
      return observed !== expected;
    case "CROSSES_ABOVE":
      return false; // handled by evaluateCondition (needs prev values)
    case "CROSSES_BELOW":
      return false;
  }
}

function crossCondition(
  operator: "CROSSES_ABOVE" | "CROSSES_BELOW",
  key: ObservationKey,
  threshold: number | undefined,
  thresholdKey: ObservationKey | undefined,
  observations: ObservationSet,
): ConditionOutcome {
  // Crossings need the current value, its previous value and the previous
  // comparator. The convention: key@prev vs comparator@prev determined the
  // prior side; key@now vs comparator@now determines the current side.
  const prevKey: Record<ObservationKey, ObservationKey> = {
    close: "prevClose",
    dailyLow: "prevClose",
    dailyHigh: "prevClose",
    dailyEma20: "prevEma20",
    dailyEma50: "prevEma50",
    dailyAtr14: "prevClose", // not meaningful for ATR crossings
    prevClose: "prevClose",
    prevEma20: "prevEma20",
    prevEma50: "prevEma50",
  };
  const now = observations[key];
  const before = observations[prevKey[key]];
  const comparatorNow =
    threshold ?? (thresholdKey !== undefined ? observations[thresholdKey] : undefined);
  // For the "previous" side of a thresholdKey comparison we approximate with
  // the current comparator unless the comparator itself has a prev series
  // (EMA keys do, via the mapping above).
  const comparatorBefore =
    threshold ?? (thresholdKey !== undefined ? observations[prevKey[thresholdKey]] : undefined);
  if (now === undefined || before === undefined || comparatorNow === undefined || comparatorBefore === undefined) {
    return "UNAVAILABLE";
  }
  const wasBelow = before <= comparatorBefore;
  const wasAbove = before >= comparatorBefore;
  const isBelow = now <= comparatorNow;
  const isAbove = now >= comparatorNow;
  if (operator === "CROSSES_ABOVE") return wasBelow && isAbove ? "PASS" : "FAIL";
  if (operator === "CROSSES_BELOW") return wasAbove && isBelow ? "PASS" : "FAIL";
  return "UNAVAILABLE";
}

/** Evaluate one condition against the observation set. Deterministic. */
export function evaluateCondition(
  rule: StrategyRule,
  condition: RuleCondition,
  observations: ObservationSet,
): ConditionTrace {
  const observed = observations[condition.key];
  const base = {
    ruleId: rule.id,
    ruleLabel: rule.label,
    key: condition.key,
    operator: condition.operator,
    expected: condition.expected,
  };
  if (condition.operator === "CROSSES_ABOVE" || condition.operator === "CROSSES_BELOW") {
    const outcome = crossCondition(
      condition.operator,
      condition.key,
      condition.threshold,
      condition.thresholdKey,
      observations,
    );
    return {
      ...base,
      observed,
      expectedValue: condition.threshold ?? (condition.thresholdKey ? observations[condition.thresholdKey] : undefined),
      outcome,
    };
  }
  if (observed === undefined) {
    return { ...base, outcome: "UNAVAILABLE" };
  }
  const expectedValue =
    condition.threshold ?? (condition.thresholdKey !== undefined ? observations[condition.thresholdKey] : undefined);
  if (expectedValue === undefined) {
    return { ...base, observed, outcome: "UNAVAILABLE" };
  }
  const outcome: ConditionOutcome = compare(condition.operator, observed, expectedValue) ? "PASS" : "FAIL";
  return { ...base, observed, expectedValue, outcome };
}

/** Aggregate a rule's outcome from its condition traces (fail-fast ordering preserved). */
function aggregateRule(rule: StrategyRule, traces: readonly ConditionTrace[]): RuleTrace {
  let outcome: ConditionOutcome = "PASS";
  for (const trace of traces) {
    if (trace.outcome === "FAIL") {
      outcome = "FAIL";
      break;
    }
    if (trace.outcome === "UNAVAILABLE") outcome = "UNAVAILABLE";
  }
  void rule;
  return {
    ruleId: traces[0]?.ruleId ?? "",
    ruleLabel: traces[0]?.ruleLabel ?? "",
    outcome,
    conditions: traces,
  };
}

/**
 * Evaluate a full rule set. UNAVAILABLE observations propagate: a rule is
 * PASS only when every condition passed; FAIL only when a condition failed;
 * UNAVAILABLE when facts were missing (never silently treated as either).
 */
export function evaluateRuleSet(
  version: Pick<StrategyVersion, "versionId">,
  rules: StrategyRuleSet,
  observations: ObservationSet,
  evaluatedAt: MarketTimestamp,
): RuleEvaluationTrace {
  const entryTraces = rules.entryRules.map((rule) =>
    aggregateRule(rule, rule.conditions.map((c) => evaluateCondition(rule, c, observations))),
  );
  const invalidationTraces = rules.invalidationRules.map((rule) =>
    aggregateRule(rule, rule.conditions.map((c) => evaluateCondition(rule, c, observations))),
  );
  const unavailableKeys = (Object.keys(observations) as ObservationKey[]).filter(
    (key) => observations[key] === undefined,
  );
  return {
    direction: rules.direction,
    strategyVersionId: version.versionId,
    evaluatedAt,
    entryTraces,
    invalidationTraces,
    unavailableKeys,
    allConditionsPassed:
      entryTraces.length > 0 && entryTraces.every((t) => t.outcome === "PASS"),
    anyInvalidationTriggered: invalidationTraces.some((t) => t.outcome === "FAIL"),
  };
}

/** A guardrail placeholder type to keep the module self-contained. */
export type RuleSetProvenance = Provenance;
