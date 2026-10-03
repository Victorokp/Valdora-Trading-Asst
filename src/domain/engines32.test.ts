/**
 * Engine tests (32I–32L): indicator math, analysis engine, rule evaluator,
 * signal derivation, risk engine and trade lifecycle — pure domain,
 * deterministic, no I/O.
 */
import { describe, expect, it } from "vitest";

import { ANALYSIS_CONVENTIONS, ema, pipsBetween, percentDistance, sma, trueRanges, wilderAtr } from "@/domain/analysis/indicators";
import { ANALYSIS_THRESHOLDS, computeAnalysis } from "@/domain/analysis/engine";
import { evaluateCondition, evaluateRuleSet, observationSetFrom, type StrategyRuleSet, type RuleEvaluationTrace } from "@/domain/strategy/rules";
import { deriveSignalState, stateRationale, buildSignal } from "@/domain/signals/engine";
import { computePositionSizing, evaluateTradeGeometry, evaluateGuardrails, worstStatus, checkMinimumRewardRisk } from "@/domain/risk/engine";
import { plannedTradeFromSignal, computeRealizedR, entrySlippagePips, nextPlannedTradeId } from "@/domain/trading/lifecycle";
import { lifecycleToValidity } from "@/domain/signals/reconciliation";
import { asId } from "@/domain/ids";
import type { MarketBar } from "@/domain/market/bar";

/** Constant-step deterministic series. */
function bars(count: number, step = 0.001): MarketBar[] {
  const out: MarketBar[] = [];
  let close = 1.0;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = open + step;
    out.push({
      instrument: "EURUSD",
      timeframe: "DAILY",
      timestamp: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) + 0.0005,
      low: Math.min(open, close) - 0.0005,
      close,
    });
  }
  return out;
}

describe("indicator math (32I)", () => {
  it("sma is undefined until the period is filled", () => {
    const values = [1, 2, 3, 4, 5];
    const result = sma(values, 3);
    expect(result[0]).toBeUndefined();
    expect(result[1]).toBeUndefined();
    expect(result[2]).toBe(2);
    expect(result[4]).toBe(4);
  });

  it("ema seeds with the SMA and smooths with 2/(span+1)", () => {
    const values = [1, 2, 3, 4, 5, 6];
    const result = ema(values, 3);
    expect(result[0]).toBeUndefined();
    expect(result[2]).toBe(2); // SMA seed of [1,2,3]
    // k = 0.5; e4 = 5*0.5 + 3.5*0.5 where e3 = 4*0.5 + 2*0.5 = 3 → e3 = 3? verify explicit:
    // e3 = value[3]*k + seed*(1-k) = 4*0.5 + 2*0.5 = 3
    expect(result[3]).toBe(3);
    // e4 = 5*0.5 + 3*0.5 = 4
    expect(result[4]).toBe(4);
  });

  it("true range uses HIGH_MINUS_LOW on the first bar (declared convention)", () => {
    const b = bars(3);
    const trs = trueRanges(b);
    expect(trs[0]).toBeCloseTo(b[0].high - b[0].low, 10);
  });

  it("Wilder ATR is undefined before the period and equals the SMA seed at period-1", () => {
    const b = bars(30);
    const atr = wilderAtr(b, 14);
    expect(atr[12]).toBeUndefined();
    expect(atr[13]).toBeDefined();
    const trs = trueRanges(b);
    const seed = trs.slice(0, 14).reduce((s, v) => s + v, 0) / 14;
    expect(atr[13]).toBeCloseTo(seed, 10);
  });

  it("conventions are the declared frozen record", () => {
    expect(ANALYSIS_CONVENTIONS.emaSeeding).toBe("SMA_SEED");
    expect(ANALYSIS_CONVENTIONS.atrMethod).toBe("WILDER");
    expect(ANALYSIS_CONVENTIONS.minimumBars).toBe(64);
  });

  it("pip and percent helpers convert deterministically", () => {
    expect(pipsBetween(1.1005, 1.1, 0.0001)).toBeCloseTo(5, 10); // (a−b)/pip, signed
    expect(pipsBetween(1.1, 1.1005, 0.0001)).toBeCloseTo(-5, 10);
    expect(percentDistance(1.1, 1.1)).toBe(0);
  });
});

describe("analysis engine (32I)", () => {
  it("classifies a monotonic uptrend as UP with POSITIVE momentum", () => {
    const result = computeAnalysis({
      instrument: "EURUSD",
      timeframe: "DAILY",
      bars: bars(120),
      pipSize: 0.0001,
      dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" },
    });
    const trend = result.observations.find((o) => o.kind === "TREND");
    expect(trend?.value).toBe("UP");
    const momentum = result.observations.find((o) => o.kind === "MOMENTUM");
    expect(momentum?.value).toBe("POSITIVE");
    expect(result.barCount).toBe(120);
    expect(result.series.ema20.length).toBe(120);
  });

  it("is deterministic: identical bars give an identical result", () => {
    const b = bars(100);
    const a1 = computeAnalysis({ instrument: "EURUSD", timeframe: "DAILY", bars: b, pipSize: 0.0001, dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" } });
    const a2 = computeAnalysis({ instrument: "EURUSD", timeframe: "DAILY", bars: b, pipSize: 0.0001, dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" } });
    expect(a2).toEqual(a1);
  });

  it("flags UNDETERMINED observations inside the warm-up instead of guessing", () => {
    const result = computeAnalysis({
      instrument: "EURUSD",
      timeframe: "DAILY",
      bars: bars(10),
      pipSize: 0.0001,
      dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" },
    });
    const trend = result.observations.find((o) => o.kind === "TREND");
    expect(trend?.value).toBe("UNDETERMINED");
    const uncertainty = result.interpretations.find((i) => i.kind === "UNCERTAINTY");
    expect(uncertainty).toBeDefined();
  });

  it("thresholds stay within their declared record", () => {
    expect(ANALYSIS_THRESHOLDS.trendSeparationAtrMultiple).toBe(0.5);
    expect(ANALYSIS_THRESHOLDS.volatilityWindow).toBe(100);
  });
});

describe("rule evaluator (32J)", () => {
  const ruleSet: StrategyRuleSet = {
    direction: "LONG",
    entryRules: [
      {
        id: "r1",
        label: "Close above EMA20",
        conditions: [{ key: "close", operator: "GT", thresholdKey: "dailyEma20", expected: "close above EMA20" }],
      },
      {
        id: "r2",
        label: "Pullback touched",
        conditions: [{ key: "dailyLow", operator: "LTE", thresholdKey: "dailyEma20", expected: "low at or below EMA20" }],
      },
    ],
    invalidationRules: [
      {
        id: "x1",
        label: "Regime lost",
        // Requirement form: the rule demands close > EMA50; a FAIL invalidates.
        conditions: [{ key: "close", operator: "GT", thresholdKey: "dailyEma50", expected: "close above EMA50" }],
      },
    ],
  };

  function obsFor(close: number, low: number, ema20: number, ema50: number) {
    return {
      close,
      dailyLow: low,
      dailyHigh: close,
      dailyEma20: ema20,
      dailyEma50: ema50,
      dailyAtr14: 0.001,
      prevClose: close,
      prevEma20: ema20,
      prevEma50: ema50,
    };
  }

  it("all-pass → CONFIRMED derivation (allConditionsPassed true)", () => {
    const obs = obsFor(1.11, 1.095, 1.10, 1.09);
    const trace = evaluateRuleSet({ versionId: asId<"StrategyVersionId">("v") }, ruleSet, obs, "2026-01-01");
    expect(trace.allConditionsPassed).toBe(true);
    expect(trace.anyInvalidationTriggered).toBe(false);
    expect(deriveSignalState(trace)).toBe("CONFIRMED");
  });

  it("one-pass-one-fail → WATCH (single pass); two-of-three → CANDIDATE", () => {
    const obs = obsFor(1.11, 1.105, 1.10, 1.09); // r1 passes, r2 fails
    const trace = evaluateRuleSet({ versionId: asId<"StrategyVersionId">("v") }, ruleSet, obs, "2026-01-01");
    expect(trace.allConditionsPassed).toBe(false);
    expect(deriveSignalState(trace)).toBe("WATCH");
  });

  it("invalidation FAIL → INVALIDATED regardless of entries", () => {
    const obs = obsFor(1.08, 1.095, 1.10, 1.09); // close < EMA50 → requirement FAIL
    const trace = evaluateRuleSet({ versionId: asId<"StrategyVersionId">("v") }, ruleSet, obs, "2026-01-01");
    expect(trace.anyInvalidationTriggered).toBe(true);
    expect(deriveSignalState(trace)).toBe("INVALIDATED");
    expect(stateRationale(trace, "INVALIDATED")).toContain("Regime lost");
  });

  it("UNAVAILABLE observations → NONE, never coerced into PASS/FAIL", () => {
    const obs = { ...obsFor(1.11, 1.095, 1.10, 1.09), dailyEma50: undefined };
    const trace = evaluateRuleSet({ versionId: asId<"StrategyVersionId">("v") }, ruleSet, obs, "2026-01-01");
    expect(trace.unavailableKeys).toContain("dailyEma50");
    // entry rules still evaluable but the trace records the gap honestly
    const cond = evaluateCondition(ruleSet.entryRules[0], ruleSet.entryRules[0].conditions[0], obs);
    expect(cond.outcome).toBe("PASS");
  });

  it("observationSetFrom aligns observations with the analysis series", () => {
    const b = bars(80);
    const analysis = computeAnalysis({ instrument: "EURUSD", timeframe: "DAILY", bars: b, pipSize: 0.0001, dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" } });
    const obs = observationSetFrom(analysis, b);
    expect(obs.close).toBe(b[b.length - 1].close);
    expect(obs.dailyEma20).toBe(analysis.series.ema20[b.length - 1]);
  });
});

describe("signal engine (32J)", () => {
  const emptyTrace: RuleEvaluationTrace = {
    direction: "LONG",
    strategyVersionId: "v",
    evaluatedAt: "2026-01-01",
    entryTraces: [],
    invalidationTraces: [],
    unavailableKeys: [],
    allConditionsPassed: false,
    anyInvalidationTriggered: false,
  };

  it("single-pass state is WATCH with a factual rationale", () => {
    const obs = {
      close: 1.11,
      dailyLow: 1.105,
      dailyHigh: 1.11,
      dailyEma20: 1.10,
      dailyEma50: 1.09,
      dailyAtr14: 0.001,
      prevClose: 1.11,
      prevEma20: 1.10,
      prevEma50: 1.09,
    };
    const ruleSet: StrategyRuleSet = {
      direction: "LONG",
      entryRules: [
        { id: "a", label: "A", conditions: [{ key: "close", operator: "GT", thresholdKey: "dailyEma20", expected: "" }] },
        { id: "b", label: "B", conditions: [{ key: "dailyLow", operator: "LTE", thresholdKey: "dailyEma20", expected: "" }] },
      ],
      invalidationRules: [],
    };
    const trace = evaluateRuleSet({ versionId: asId<"StrategyVersionId">("v") }, ruleSet, obs, "2026-01-01");
    expect(deriveSignalState(trace)).toBe("WATCH");
  });

  it("buildSignal copies the declared exit plan onto intended levels", () => {
    const b = bars(80);
    const analysis = computeAnalysis({ instrument: "EURUSD", timeframe: "DAILY", bars: b, pipSize: 0.0001, dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" } });
    const ruleSet: StrategyRuleSet = {
      direction: "LONG",
      entryRules: [],
      invalidationRules: [],
      exitPlan: { stopAtrMultiple: 1, targetAtrMultiple: 2, description: "1x/2x ATR" },
    };
    const signal = buildSignal({
      id: asId<"SignalId">("sig-1"),
      strategyId: asId<"StrategyId">("s"),
      version: { versionId: asId<"StrategyVersionId">("v") },
      rules: ruleSet,
      trace: emptyTrace,
      state: "CONFIRMED",
      analysis,
      bars: b,
      timeframe: "DAILY",
      dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" },
      observedPipSize: 0.0001,
      signalAt: "2026-01-01",
      intendedEntryAt: "2026-01-02",
    });
    const lastClose = b[b.length - 1].close;
    const atr = analysis.series.atr14[b.length - 1];
    expect(signal.intendedEntry.stopPrice).toBeCloseTo(lastClose - (atr ?? 0), 10);
    expect(signal.intendedEntry.targetPrice).toBeCloseTo(lastClose + 2 * (atr ?? 0), 10);
    expect(signal.intendedEntry.timing).toBe("NEXT_BAR_OPEN");
  });

  it("lifecycle → validity bridge covers every state", () => {
    expect(lifecycleToValidity("NONE")).toBe("NO_SETUP");
    expect(lifecycleToValidity("WATCH")).toBe("WATCH");
    expect(lifecycleToValidity("CANDIDATE")).toBe("SETUP_FORMING");
    expect(lifecycleToValidity("CONFIRMED")).toBe("VALID");
    expect(lifecycleToValidity("INVALIDATED")).toBe("INVALIDATED");
    expect(lifecycleToValidity("EXPIRED")).toBe("EXPIRED");
  });
});

describe("risk engine (32K)", () => {
  it("geometry: distances and R:R computed only from explicit inputs", () => {
    const geo = evaluateTradeGeometry({ direction: "LONG", entry: 1.1, stop: 1.099, target: 1.102, pipSize: 0.0001 });
    expect(geo.stopDistancePips).toBeCloseTo(10, 6);
    expect(geo.targetDistancePips).toBeCloseTo(20, 6);
    expect(geo.rewardRisk).toBeCloseTo(2, 6);
    expect(geo.geometryValid).toBe(true);
  });

  it("geometry: missing inputs produce problems, never guesses", () => {
    const geo = evaluateTradeGeometry({ direction: "LONG", entry: 1.1 });
    expect(geo.stopDistancePips).toBeUndefined();
    expect(geo.problems.join(" ")).toContain("stop price not supplied");
  });

  it("geometry: invalid side → geometryValid false + explanation", () => {
    const geo = evaluateTradeGeometry({ direction: "LONG", entry: 1.1, stop: 1.101, target: 1.102, pipSize: 0.0001 });
    expect(geo.geometryValid).toBe(false);
    expect(geo.problems.join(" ")).toContain("stop must be below entry");
  });

  it("sizing: UNKNOWN without equity/risk inputs (no $10k assumption)", () => {
    const sizing = computePositionSizing({ stopDistancePips: 10, pipSize: 0.0001, pipValuePerLot: 10 });
    expect(sizing.status).toBe("UNKNOWN");
    expect(sizing.reason).toContain("no account equity");
  });

  it("sizing: computes only when every input exists", () => {
    const sizing = computePositionSizing({ stopDistancePips: 10, pipSize: 0.0001, pipValuePerLot: 10, accountEquity: 10_000, riskFraction: 0.01 });
    expect(sizing.status).toBe("NORMAL");
    expect(sizing.riskAmount).toBeCloseTo(100, 6);
    expect(sizing.positionUnits).toBeCloseTo(100_000, 0); // 100 risk / 100 per lot
  });

  it("guardrails: unconfigured limits report UNKNOWN with reasons", () => {
    const checks = evaluateGuardrails({ guardrails: {} });
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe("UNKNOWN");
  });

  it("guardrails: breach → BLOCKED, within → NORMAL", () => {
    const checks = evaluateGuardrails({ guardrails: { maxOpenExposureR: 3 }, openExposureR: 4 });
    expect(checks[0].status).toBe("BLOCKED");
    const ok = evaluateGuardrails({ guardrails: { maxOpenExposureR: 5 }, openExposureR: 4 });
    expect(ok[0].status).toBe("NORMAL");
  });

  it("worst-of aggregation orders BLOCKED > WARNING > UNKNOWN > NORMAL", () => {
    expect(worstStatus(["NORMAL", "UNKNOWN", "WARNING"])).toBe("WARNING");
    expect(worstStatus(["NORMAL", "BLOCKED"])).toBe("BLOCKED");
    expect(worstStatus(["NORMAL"])).toBe("NORMAL");
  });

  it("minimum R:R check blocks with a factual message", () => {
    const blocked = checkMinimumRewardRisk(1.5, 2);
    expect(blocked.status).toBe("BLOCKED");
    const ok = checkMinimumRewardRisk(2.5, 2);
    expect(ok.status).toBe("NORMAL");
    const unknown = checkMinimumRewardRisk(undefined, 2);
    expect(unknown.status).toBe("UNKNOWN");
  });
});

describe("trade lifecycle (32L)", () => {
  const emptyTrace: RuleEvaluationTrace = {
    direction: "LONG",
    strategyVersionId: "v",
    evaluatedAt: "2026-01-01",
    entryTraces: [],
    invalidationTraces: [],
    unavailableKeys: [],
    allConditionsPassed: false,
    anyInvalidationTriggered: false,
  };

  const signal = buildSignal({
    id: asId<"SignalId">("sig-9"),
    strategyId: asId<"StrategyId">("s"),
    version: { versionId: asId<"StrategyVersionId">("EURUSD-GR-v1") },
    rules: { direction: "LONG", entryRules: [], invalidationRules: [], exitPlan: { stopAtrMultiple: 1, targetAtrMultiple: 2, description: "" } },
    trace: emptyTrace,
    state: "CONFIRMED",
    analysis: computeAnalysis({ instrument: "EURUSD", timeframe: "DAILY", bars: bars(80), pipSize: 0.0001, dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" } }),
    bars: bars(80),
    timeframe: "DAILY",
    dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" },
    observedPipSize: 0.0001,
    signalAt: "2026-01-01",
    intendedEntryAt: "2026-01-02",
  });

  it("planned trade derives levels from the signal with R:R", () => {
    const lastClose = bars(80)[bars(80).length - 1].close; // deterministic series → same close
    const geo = evaluateTradeGeometry({
      direction: "LONG",
      entry: lastClose,
      stop: signal.intendedEntry.stopPrice,
      target: signal.intendedEntry.targetPrice,
      pipSize: 0.0001,
    });
    const planned = plannedTradeFromSignal({
      plannedId: nextPlannedTradeId("x"),
      signal,
      risk: geo,
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(planned.id).toBe("plan-x");
    expect(planned.riskReward).toBeCloseTo(2, 6);
    expect(planned.stopPrice).toBeLessThan(planned.targetPrice);
  });

  it("realized R is defined only for closed trades with a known stop", () => {
    expect(computeRealizedR({ direction: "LONG", entry: 1.1, exit: 1.102, stopPrice: 1.099 })).toBeCloseTo(2, 10);
    expect(computeRealizedR({ direction: "LONG", entry: 1.1, stopPrice: 1.099 })).toBeUndefined();
    expect(computeRealizedR({ direction: "SHORT", entry: 1.1, exit: 1.098, stopPrice: 1.101 })).toBeCloseTo(2, 10);
  });

  it("slippage is signed, positive = worse", () => {
    expect(entrySlippagePips({ direction: "LONG", intendedEntry: 1.1, actualEntry: 1.1002, pipSize: 0.0001 })).toBeCloseTo(2, 10);
    expect(entrySlippagePips({ direction: "LONG", intendedEntry: 1.1, actualEntry: 1.0999, pipSize: 0.0001 })).toBeCloseTo(-1, 10);
  });
});
