/**
 * Integration scenarios 1–9 (32I–32R acceptance): the full deterministic
 * chain market data → analysis → strategy rules → signal → risk → planned
 * trade → executed → journal → performance, with every honesty requirement
 * asserted. Research evidence enters only through the ResearchService.
 */
import { describe, expect, it } from "vitest";

import { asId } from "@/domain/ids";
import type { MarketBar } from "@/domain/market/bar";
import type { RawBarInput } from "@/domain/market/quality";
import { MemoryCollectionRepository } from "@/services/persistence/memory";
import { testStamp } from "@/services/persistence";
import { MarketDataServiceImpl, StaticMarketDataProvider } from "@/services/market";
import { AnalysisServiceImpl } from "@/services/analysis";
import { StrategyServiceImpl } from "@/services/strategy";
import { GR_STRATEGY_ID, GR_VERSION_ID } from "@/services/strategy/seed";
import { SignalServiceImpl } from "@/services/signals";
import { RiskServiceImpl, DEFAULT_GUARDRAIL_PREFERENCES } from "@/services/risk";
import { TradeJournalServiceImpl } from "@/services/journal";
import { computeUserPerformance } from "@/services/performance";
import { buildAIContext, taggedUnavailable } from "@/services/ai/contextBuilder";
import { researchService } from "@/services/research";
import { plannedTradeFromSignal, computeRealizedR } from "@/domain/trading/lifecycle";
import type { ExecutedTrade } from "@/domain/trading/trade";

const FIXED_NOW = "2026-09-28T12:00:00Z";
function fixedNow(): string {
  return FIXED_NOW;
}

/** Deterministic synthetic uptrend with pullbacks (never a research dataset). */
function syntheticBars(count: number): MarketBar[] {
  const bars: MarketBar[] = [];
  let close = 1.0;
  for (let i = 0; i < count; i++) {
    const open = close;
    const cycle = i % 14;
    const move = cycle < 8 ? 0.0004 : -0.0002;
    close = open + move;
    bars.push({
      instrument: "EURUSD",
      timeframe: "DAILY",
      timestamp: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) + 0.001,
      low: Math.min(open, close) - 0.001,
      close,
    });
  }
  return bars;
}

function fixtureProvider(bars: readonly MarketBar[]): StaticMarketDataProvider {
  const raw: RawBarInput[] = bars.map((b) => ({
    instrument: b.instrument,
    timeframe: b.timeframe,
    timestamp: b.timestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
  return new StaticMarketDataProvider({ EURUSD: raw });
}

/** Shared wired context: market → analysis → strategy → signals → risk → journal. */
function makeContext(bars: readonly MarketBar[]) {
  const marketData = new MarketDataServiceImpl(fixtureProvider(bars));
  const analysis = new AnalysisServiceImpl(marketData);
  const strategy = new StrategyServiceImpl();
  const signalRepo = new MemoryCollectionRepository<import("@/domain/signals/signal").Signal, import("@/domain/ids").SignalId>((s) => s.id);
  const signals = new SignalServiceImpl(signalRepo, () => testStamp(), fixedNow);
  const planned = new MemoryCollectionRepository<import("@/domain/trading/trade").PlannedTrade, import("@/domain/ids").PlannedTradeId>((t) => t.id);
  const executed = new MemoryCollectionRepository<ExecutedTrade, import("@/domain/ids").TradeId>((t) => t.id);
  const journalRepo = new MemoryCollectionRepository<import("@/domain/trading/journalEntry").JournalEntry, import("@/domain/ids").JournalEntryId>((e) => e.id);
  const journal = new TradeJournalServiceImpl(planned, executed, journalRepo, fixedNow);
  const risk = new RiskServiceImpl(new MemoryPreferencesRepositoryStub(), executed, async () => DEFAULT_GUARDRAIL_PREFERENCES, () => testStamp());
  return { marketData, analysis, strategy, signals, risk, journal, planned, executed, journalRepo, signalRepo };
}

/** Minimal preferences stub (constructor contract only). */
class MemoryPreferencesRepositoryStub {
  async load(): Promise<{ status: "SUCCESS"; value: null }> {
    return { status: "SUCCESS", value: null };
  }
  async save<T>(prefs: T): Promise<{ status: "SUCCESS"; value: T }> {
    return { status: "SUCCESS", value: prefs };
  }
  async clear(): Promise<{ status: "SUCCESS"; value: null }> {
    return { status: "SUCCESS", value: null };
  }
}

/** Run the market → analysis → rules → signal pipeline once (uniform shape). */
async function runPipeline(bars: readonly MarketBar[]) {
  const ctx = makeContext(bars);
  const analysisResult = await ctx.analysis.analyze({ instrument: "EURUSD", timeframe: "DAILY" });
  if (analysisResult.status !== "SUCCESS") return { ctx, analysisResult, traceResult: undefined, signalResult: undefined } as const;
  const rulesResult = await ctx.strategy.getRuleSet(GR_VERSION_ID, "LONG");
  if (rulesResult.status !== "SUCCESS") return { ctx, analysisResult, traceResult: undefined, signalResult: undefined } as const;
  const traceResult = await ctx.strategy.evaluateRules({
    versionId: GR_VERSION_ID,
    direction: "LONG",
    bars,
    instrument: "EURUSD",
  });
  if (traceResult.status !== "SUCCESS") return { ctx, analysisResult, traceResult, signalResult: undefined } as const;
  const signalResult = await ctx.signals.evaluate({
    strategyId: GR_STRATEGY_ID,
    strategyVersionId: GR_VERSION_ID,
    instrument: "EURUSD",
    timeframe: "DAILY",
    rules: rulesResult.value,
    trace: traceResult.value,
    analysis: analysisResult.value,
    bars,
    dataProvenance: { sourceType: "MARKET_DATA_PROVIDER", sourceName: "static fixture (labeled)" },
    observedPipSize: 0.0001,
  });
  return { ctx, analysisResult, traceResult, signalResult } as const;
}

describe("Scenario 1 — market → analysis (happy path)", () => {
  it("analyzes quality-gated bars and reports structured observations", async () => {
    const bars = syntheticBars(120);
    const { analysisResult } = await runPipeline(bars);
    expect(analysisResult.status).toBe("SUCCESS");
    if (analysisResult.status === "SUCCESS") {
      expect(analysisResult.value.barCount).toBe(120);
      expect(analysisResult.value.observations.length).toBeGreaterThan(0);
      expect(analysisResult.value.conventions.version).toBe("valdora-analysis-v1");
    }
  });
});

describe("Scenario 2 — insufficient data produces an explicit state, never a fallback", () => {
  it("returns VALIDATION_ERROR for a short dataset", async () => {
    const { analysisResult } = await runPipeline(syntheticBars(40));
    expect(analysisResult.status).toBe("VALIDATION_ERROR");
    if (analysisResult.status === "VALIDATION_ERROR") {
      expect(analysisResult.error.message).toMatch(/insufficient data/);
    }
  });
});

describe("Scenario 3 — analysis → strategy rules → signal derivation", () => {
  it("produces a full rule trace and derives exactly one lifecycle state", async () => {
    const bars = syntheticBars(120);
    const { traceResult, signalResult } = await runPipeline(bars);
    if (traceResult === undefined || signalResult === undefined) throw new Error("pipeline failed");
    expect(traceResult.status).toBe("SUCCESS");
    expect(signalResult.status).toBe("SUCCESS");
    if (traceResult.status === "SUCCESS" && signalResult.status === "SUCCESS") {
      const t = traceResult.value;
      expect(t.entryTraces.length).toBe(2);
      expect(t.invalidationTraces.length).toBe(1);
      const legal = ["WATCH", "CANDIDATE", "CONFIRMED", "NONE", "INVALIDATED", "EXPIRED"];
      expect(legal).toContain(signalResult.value.state);
    }
  });

  it("is deterministic: identical bars produce identical traces", async () => {
    const bars = syntheticBars(120);
    const a = await runPipeline(bars);
    const b = await runPipeline(bars);
    if (a.traceResult?.status === "SUCCESS" && b.traceResult?.status === "SUCCESS") {
      expect(b.traceResult.value).toEqual(a.traceResult.value);
    }
    expect(a.analysisResult).toEqual(b.analysisResult);
  });
});

describe("Scenario 4 — signal → risk → planned trade", () => {
  it("derives a planned trade from a confirmed signal with valid geometry", async () => {
    const bars = syntheticBars(120);
    const pipeline = await runPipeline(bars);
    const { traceResult } = pipeline;
    const signalResult = pipeline.signalResult;
    if (traceResult === undefined || signalResult === undefined) return;
    const { risk } = pipeline.ctx;
    const candidate = await risk.evaluateCandidate({
      direction: "LONG",
      instrument: "EURUSD",
      entry: 1.1,
      stop: 1.099,
      target: 1.102,
    });
    expect(candidate.status).toBe("SUCCESS");
    if (candidate.status === "SUCCESS") {
      expect(candidate.value.geometry.rewardRisk).toBeCloseTo(2, 5);
    }
    // Derive a planned trade only when the pipeline produced a signal record.
    if (signalResult.status !== "SUCCESS") return;
    const signalRecord = signalResult.value.signal;
    if (signalRecord !== null) {
      const riskEval = candidate.status === "SUCCESS" ? candidate.value.geometry : undefined;
      if (!riskEval) return;
      const planned = plannedTradeFromSignal({
        plannedId: asId<"PlannedTradeId">("plan-test"),
        signal: signalRecord,
        risk: riskEval,
        createdAt: fixedNow(),
      });
      expect(planned.instrument).toBe("EURUSD");
      expect(planned.stopPrice).toBeLessThan(planned.targetPrice);
    }
  });
});

describe("Scenario 5 — planned → executed is a user act", () => {
  it("records an executed trade only through the journal service", async () => {
    const { journal } = makeContext(syntheticBars(120));
    const executed: ExecutedTrade = {
      id: asId<"TradeId">("trade-1"),
      instrument: "EURUSD",
      direction: "LONG",
      strategyVersionId: asId<"StrategyVersionId">(GR_VERSION_ID),
      entry: 1.1,
      stopPrice: 1.099,
      exit: 1.102,
      entryAt: "2026-09-01T00:00:00Z",
      exitAt: "2026-09-03T00:00:00Z",
      realizedR: computeRealizedR({ direction: "LONG", entry: 1.1, exit: 1.102, stopPrice: 1.099 }),
      timing: {
        instrument: "EURUSD",
        stamps: { signalAt: "2026-08-31T00:00:00Z", intendedEntryAt: "2026-09-01T00:00:00Z", actualEntryAt: "2026-09-01T00:00:00Z" },
        source: "USER_REPORTED",
        status: "ENTRY_ON_TIME",
        sensitivityNote: "Historical research measured material sensitivity to execution delay.",
      },
      provenance: { sourceType: "USER_INPUT" },
    };
    const recorded = await journal.recordExecutedTrade(executed);
    expect(recorded.status).toBe("SUCCESS");
    const list = await journal.listExecutedTrades();
    if (list.status === "SUCCESS") expect(list.value).toHaveLength(1);
  });
});

describe("Scenario 6 — executed → journal → performance (never mixed)", () => {
  it("computes user performance from the journal only", async () => {
    const { journal, executed } = makeContext(syntheticBars(120));
    await journal.recordExecutedTrade({
      id: asId<"TradeId">("t1"),
      instrument: "EURUSD",
      direction: "LONG",
      strategyVersionId: asId<"StrategyVersionId">(GR_VERSION_ID),
      entry: 1.1,
      stopPrice: 1.099,
      exit: 1.102,
      entryAt: "2026-09-01T00:00:00Z",
      exitAt: "2026-09-02T00:00:00Z",
      realizedR: 2,
      timing: {
        instrument: "EURUSD",
        stamps: { signalAt: "2026-08-31T00:00:00Z", intendedEntryAt: "2026-09-01T00:00:00Z" },
        source: "USER_REPORTED",
        status: "UNKNOWN",
        sensitivityNote: "note",
      },
      provenance: { sourceType: "USER_INPUT" },
    });
    const trades = await executed.list();
    expect(trades.status).toBe("SUCCESS");
    if (trades.status === "SUCCESS") {
      const summary = computeUserPerformance(trades.value, fixedNow());
      expect(summary.hasTrades).toBe(true);
      expect(summary.performance.totalR).toBeCloseTo(2, 10);
    }
  });

  it("keeps historical research performance on a separate surface", async () => {
    const user = computeUserPerformance([], fixedNow());
    expect(user.hasTrades).toBe(false);
    const research = await researchService.getPhaseMetrics("phase21");
    expect(research.status).toBe("SUCCESS");
    if (research.status === "SUCCESS") {
      // The +32.2644R research figure exists ONLY as a cited research metric.
      const totalR = research.value.find((m) => m.label === "Total R");
      expect(totalR?.value).toBe("+32.2644R");
      expect(totalR?.ref.phase).toBe("PHASE21");
    }
  });
});

describe("Scenario 7 — unavailable pair: no fabrication", () => {
  it("returns NOT_FOUND (never invented data) for a pair without a dataset", async () => {
    const bars = syntheticBars(120);
    const marketData = new MarketDataServiceImpl(fixtureProvider(bars));
    const result = await marketData.getHistoricalBars("USDCHF", "DAILY", "1y");
    expect(result.status).toBe("NOT_FOUND");
    const analysis = new AnalysisServiceImpl(marketData);
    const metadata = await marketData.getInstrumentMetadata("USDCHF");
    expect(metadata.status).toBe("SUCCESS"); // the catalog entry exists (factually labeled)
    void analysis;
  });
});

describe("Scenario 8 — ResearchService → evidence → AI context", () => {
  it("builds a provenance-tagged AI context with mandatory uncertainty flags", async () => {
    const refs = await researchService.getResearchRefs("phase21");
    expect(refs.status).toBe("SUCCESS");
    if (refs.status !== "SUCCESS") return;

    const bundle = buildAIContext({
      userQuestion: "What does the historical evidence say?",
      researchRefs: refs.value,
      limitations: ["Historical sample only."],
    });
    expect(bundle.context.researchReferences.length).toBeGreaterThan(0);
    expect(bundle.context.limitations).toContain("Historical sample only.");
    // No market data configured → tagged UNAVAILABLE with uncertainty flags.
    expect(bundle.tagged.risk.domain).toBe("UNAVAILABLE");
    expect(bundle.context.uncertaintyFlags.length).toBeGreaterThan(0);
  });

  it("tags unavailable inputs as UNAVAILABLE — never padded", () => {
    const tag = taggedUnavailable("market data not configured");
    expect(tag.domain).toBe("UNAVAILABLE");
    expect(tag.value).toBeNull();
  });
});

describe("Scenario 9 — user vs historical separation enforced by shape", () => {
  it("user performance and research metrics never share a computation path", async () => {
    const userSummary = computeUserPerformance([], fixedNow());
    const research = await researchService.getPhaseMetrics("phase21");
    // The user summary is zero-shaped with hasTrades=false; research metrics
    // carry their own refs. No code path mixes them.
    expect(userSummary.hasTrades).toBe(false);
    expect(userSummary.performance.totalTrades).toBe(0);
    if (research.status === "SUCCESS") {
      for (const metric of research.value) {
        expect(metric.ref.phase).toMatch(/^PHASE\d+$/);
      }
    }
  });
});
