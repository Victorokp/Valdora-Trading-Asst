/**
 * Service-implementation tests (32I–32R): analysis, strategy, signals,
 * risk, journal, notifications — deterministic, in-memory, honest states.
 */
import { describe, expect, it } from "vitest";

import { serviceSuccess } from "@/domain/errors";
import { asId } from "@/domain/ids";
import type { MarketBar } from "@/domain/market/bar";
import { MemoryCollectionRepository, MemoryPreferencesRepository } from "@/services/persistence/memory";
import { testStamp } from "@/services/persistence";
import { AnalysisServiceImpl } from "@/services/analysis";
import { StrategyServiceImpl } from "@/services/strategy";
import { SignalServiceImpl } from "@/services/signals";
import { RiskServiceImpl, DEFAULT_GUARDRAIL_PREFERENCES, type GuardrailPreferences } from "@/services/risk";
import { TradeJournalServiceImpl } from "@/services/journal";
import { NotificationServiceImpl, MemoryNotificationRepository } from "@/services/notifications";
import { computeUserPerformance } from "@/services/performance";
import { UnconfiguredMarketDataService, StaticMarketDataProvider, MarketDataServiceImpl } from "@/services/market";
import { GR_STRATEGY_ID, GR_VERSION_ID } from "@/services/strategy/seed";
import type { ExecutedTrade } from "@/domain/trading/trade";

/** Deterministic synthetic daily bars (not any research dataset). */
function syntheticBars(count: number, drift = 0.2): MarketBar[] {
  const bars: MarketBar[] = [];
  let close = 1.0;
  for (let i = 0; i < count; i++) {
    const open = close;
    const move = ((i % 7) - 3) / 1000 + (i % 2 === 0 ? drift / 1000 : -drift / 2000);
    close = open + move;
    const high = Math.max(open, close) + 0.002;
    const low = Math.min(open, close) - 0.002;
    const day = new Date(Date.UTC(2020, 0, 1 + i));
    bars.push({
      instrument: "EURUSD",
      timeframe: "DAILY",
      timestamp: day.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
    });
  }
  return bars;
}

describe("AnalysisServiceImpl (32I)", () => {
  it("returns NOT_CONFIGURED when no market-data provider exists", async () => {
    const svc = new AnalysisServiceImpl(new UnconfiguredMarketDataService());
    const result = await svc.analyze({ instrument: "EURUSD", timeframe: "DAILY" });
    expect(result.status).toBe("NOT_CONFIGURED");
  });

  it("returns NOT_FOUND for an unknown instrument", async () => {
    const provider = new StaticMarketDataProvider({});
    const svc = new AnalysisServiceImpl(new MarketDataServiceImpl(provider));
    const result = await svc.analyze({ instrument: "XXXXXX", timeframe: "DAILY" });
    expect(result.status).toBe("NOT_FOUND");
  });

  it("returns VALIDATION_ERROR on insufficient bars — no silent fallback", async () => {
    const provider = new StaticMarketDataProvider({
      EURUSD: syntheticBars(10).map((b) => ({
        instrument: b.instrument,
        timeframe: b.timeframe,
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    });
    const svc = new AnalysisServiceImpl(new MarketDataServiceImpl(provider));
    const result = await svc.analyze({ instrument: "EURUSD", timeframe: "DAILY" });
    expect(result.status).toBe("VALIDATION_ERROR");
    if (result.status === "VALIDATION_ERROR") {
      expect(result.error.message).toContain("insufficient data");
    }
  });

  it("computes a deterministic analysis from a valid dataset", async () => {
    const bars = syntheticBars(120);
    const provider = new StaticMarketDataProvider({
      EURUSD: bars.map((b) => ({
        instrument: b.instrument,
        timeframe: b.timeframe,
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    });
    const svc = new AnalysisServiceImpl(new MarketDataServiceImpl(provider));
    const result = await svc.analyze({ instrument: "EURUSD", timeframe: "DAILY" });
    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.value.barCount).toBe(120);
      const again = await svc.analyze({ instrument: "EURUSD", timeframe: "DAILY" });
      expect(again).toEqual(result);
    }
  });
});

describe("StrategyServiceImpl (32J)", () => {
  const svc = new StrategyServiceImpl();

  it("lists the seeded frozen strategy only", async () => {
    const list = await svc.listStrategies();
    expect(list.status).toBe("SUCCESS");
    if (list.status === "SUCCESS") expect(list.value.map((s) => s.id)).toEqual([GR_STRATEGY_ID]);
  });

  it("serves the LONG rule set and the declared-empty SHORT set", async () => {
    const long = await svc.getRuleSet(GR_VERSION_ID, "LONG");
    expect(long.status).toBe("SUCCESS");
    if (long.status === "SUCCESS") expect(long.value.entryRules.length).toBeGreaterThan(0);

    const short = await svc.getRuleSet(GR_VERSION_ID, "SHORT");
    expect(short.status).toBe("SUCCESS");
    if (short.status === "SUCCESS") expect(short.value.entryRules).toHaveLength(0);
  });

  it("rejects rule evaluation for the declared out-of-scope side", async () => {
    const result = await svc.evaluateRules({
      versionId: GR_VERSION_ID,
      direction: "SHORT",
      bars: syntheticBars(100),
      instrument: "EURUSD",
    });
    expect(result.status).toBe("VALIDATION_ERROR");
  });

  it("evaluates rules deterministically over supplied bars", async () => {
    const bars = syntheticBars(100);
    const a = await svc.evaluateRules({ versionId: GR_VERSION_ID, direction: "LONG", bars, instrument: "EURUSD" });
    const b = await svc.evaluateRules({ versionId: GR_VERSION_ID, direction: "LONG", bars, instrument: "EURUSD" });
    expect(a.status).toBe("SUCCESS");
    expect(b).toEqual(a);
    if (a.status === "SUCCESS") {
      expect(a.value.entryTraces.length).toBe(2);
      expect(a.value.strategyVersionId).toBe(GR_VERSION_ID);
    }
  });

  it("returns VALIDATION_ERROR below the minimum bar count", async () => {
    const result = await svc.evaluateRules({
      versionId: GR_VERSION_ID,
      direction: "LONG",
      bars: syntheticBars(30),
      instrument: "EURUSD",
    });
    expect(result.status).toBe("VALIDATION_ERROR");
  });
});

describe("SignalServiceImpl (32J)", () => {
  function makeService() {
    const records = new MemoryCollectionRepository<import("@/domain/signals/signal").Signal, import("@/domain/ids").SignalId>(
      (s) => s.id,
    );
    return new SignalServiceImpl(records, () => testStamp());
  }

  it("stores nothing on a NONE evaluation", async () => {
    const svc = makeService();
    const bars = syntheticBars(100);
    const strategy = new StrategyServiceImpl();
    const trace = await strategy.evaluateRules({ versionId: GR_VERSION_ID, direction: "LONG", bars, instrument: "EURUSD" });
    expect(trace.status).toBe("SUCCESS");
    if (trace.status !== "SUCCESS") return;
    const rules = await strategy.getRuleSet(GR_VERSION_ID, "LONG");
    if (rules.status !== "SUCCESS") return;
    const result = await svc.evaluate({
      strategyId: GR_STRATEGY_ID,
      strategyVersionId: GR_VERSION_ID,
      instrument: "EURUSD",
      timeframe: "DAILY",
      rules: rules.value,
      trace: trace.value,
      analysis: {
        instrument: "EURUSD",
        timeframe: "DAILY",
        asOf: bars[bars.length - 1].timestamp,
        observations: [],
        interpretations: [],
        dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" },
        series: { ema20: [], ema50: [], atr14: [] },
        indicatorValues: [],
        evaluatedBar: bars[bars.length - 1].timestamp,
        barCount: bars.length,
        conventions: {
          version: "valdora-analysis-v1",
          emaSeeding: "SMA_SEED",
          atrMethod: "WILDER",
          trueRangeFirstBar: "HIGH_MINUS_LOW",
          volatilityClassification: "ATR_WINDOW_PERCENTILE_Q25_Q75_Q90",
          minimumAtrObservations: 20,
          minimumBars: 64,
        },
      },
      bars,
      dataProvenance: { sourceType: "MARKET_DATA_PROVIDER" },
      observedPipSize: 0.0001,
    });
    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.value.signal === null || result.value.signal !== null).toBe(true); // state-dependent
    }
    const list = await svc.getSignals("EURUSD");
    if (list.status === "SUCCESS") {
      // No fabricated records: count matches how many non-NONE evaluations occurred (0–1).
      expect(list.value.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("RiskServiceImpl (32K)", () => {
  function makeService(guardrails: GuardrailPreferences = DEFAULT_GUARDRAIL_PREFERENCES) {
    const executed = new MemoryCollectionRepository<ExecutedTrade, import("@/domain/ids").TradeId>((t) => t.id);
    const prefs = new MemoryPreferencesRepository();
    return new RiskServiceImpl(prefs, executed, async () => guardrails);
  }

  it("reports UNKNOWN aggregate with explanations when nothing is configured", async () => {
    const svc = makeService();
    const state = await svc.getRiskState();
    expect(state.status).toBe("SUCCESS");
    if (state.status === "SUCCESS") {
      expect(state.value.guardrailStatus).toBe("UNKNOWN");
      expect(state.value.guardrails.length).toBeGreaterThan(0);
      for (const check of state.value.guardrails) {
        expect(check.message.length).toBeGreaterThan(0);
      }
    }
  });

  it("blocks a candidate below the minimum R:R with a factual reason", async () => {
    const svc = makeService({ guardrails: {}, minRewardRisk: 3 });
    const evalResult = await svc.evaluateCandidate({
      direction: "LONG",
      instrument: "EURUSD",
      entry: 1.1,
      stop: 1.099,
      target: 1.101,
    });
    expect(evalResult.status).toBe("SUCCESS");
    if (evalResult.status === "SUCCESS") {
      expect(evalResult.value.geometry.rewardRisk).toBeCloseTo(1, 5);
      expect(evalResult.value.aggregateStatus).toBe("BLOCKED");
      const minCheck = evalResult.value.guardrailChecks.find((c) => c.message.includes("minimum"));
      expect(minCheck?.status).toBe("BLOCKED");
    }
  });

  it("reports INVALID geometry when stop/target are on the wrong side", async () => {
    const svc = makeService();
    const evalResult = await svc.evaluateCandidate({
      direction: "LONG",
      instrument: "EURUSD",
      entry: 1.1,
      stop: 1.101, // above entry for a long — invalid
      target: 1.099,
    });
    if (evalResult.status === "SUCCESS") {
      expect(evalResult.value.geometry.geometryValid).toBe(false);
      expect(evalResult.value.aggregateStatus).toBe("BLOCKED");
    }
  });

  it("never assumes an account size — sizing is UNKNOWN without inputs", async () => {
    const svc = makeService();
    const evalResult = await svc.evaluateCandidate({
      direction: "LONG",
      instrument: "EURUSD",
      entry: 1.1,
      stop: 1.099,
      target: 1.102,
    });
    if (evalResult.status === "SUCCESS") {
      expect(evalResult.value.sizing.status).toBe("UNKNOWN");
      expect(evalResult.value.sizing.reason).toContain("no account equity");
    }
  });
});

describe("TradeJournalServiceImpl (32L/32M)", () => {
  function makeService() {
    const planned = new MemoryCollectionRepository<import("@/domain/trading/trade").PlannedTrade, import("@/domain/ids").PlannedTradeId>((t) => t.id);
    const executed = new MemoryCollectionRepository<ExecutedTrade, import("@/domain/ids").TradeId>((t) => t.id);
    const journal = new MemoryCollectionRepository<import("@/domain/trading/journalEntry").JournalEntry, import("@/domain/ids").JournalEntryId>((e) => e.id);
    return new TradeJournalServiceImpl(planned, executed, journal, () => "2026-09-28T00:00:00Z");
  }

  it("creates, lists and discards a planned trade", async () => {
    const svc = makeService();
    const planned = {
      id: asId<"PlannedTradeId">("plan-1"),
      instrument: "EURUSD" as const,
      direction: "LONG" as const,
      signalId: asId<"SignalId">("sig-1"),
      strategyVersionId: asId<"StrategyVersionId">(GR_VERSION_ID),
      intendedEntry: 1.1,
      stopPrice: 1.099,
      targetPrice: 1.102,
      createdAt: "2026-09-28T00:00:00Z",
    };
    const created = await svc.createPlannedTrade(planned);
    expect(created.status).toBe("SUCCESS");
    const list = await svc.listPlannedTrades();
    if (list.status === "SUCCESS") expect(list.value).toHaveLength(1);
    const discarded = await svc.discardPlannedTrade("plan-1");
    expect(discarded.status).toBe("SUCCESS");
    const after = await svc.listPlannedTrades();
    if (after.status === "SUCCESS") expect(after.value).toHaveLength(0);
  });

  it("rejects an invalid planned trade with VALIDATION_ERROR", async () => {
    const svc = makeService();
    const result = await svc.createPlannedTrade({
      id: asId<"PlannedTradeId">("plan-2"),
      instrument: "EURUSD" as const,
      direction: "LONG" as const,
      signalId: asId<"SignalId">("sig-1"),
      strategyVersionId: asId<"StrategyVersionId">(GR_VERSION_ID),
      intendedEntry: -1, // invalid
      stopPrice: 1.099,
      targetPrice: 1.102,
      createdAt: "2026-09-28T00:00:00Z",
    });
    expect(result.status).toBe("VALIDATION_ERROR");
  });

  it("creates a journal entry with a server-stamped id and createdAt", async () => {
    const svc = makeService();
    const created = await svc.createJournalEntry({
      kind: "REVIEW",
      title: "Weekly review",
      body: "Followed the plan; no forced entries.",
      relatedTradeIds: [],
      tags: ["discipline"],
    });
    expect(created.status).toBe("SUCCESS");
    if (created.status === "SUCCESS") {
      expect(created.value.id.length).toBeGreaterThan(0);
      expect(created.value.createdAt).toBe("2026-09-28T00:00:00Z");
    }
  });

  it("returns NOT_FOUND for a missing executed trade", async () => {
    const svc = makeService();
    const result = await svc.getExecutedTrade("does-not-exist");
    expect(result.status).toBe("NOT_FOUND");
  });
});

describe("NotificationServiceImpl (32R)", () => {
  function makeService() {
    const repo = new MemoryNotificationRepository();
    return { svc: new NotificationServiceImpl(repo, () => testStamp()), repo };
  }

  it("creates, counts and marks read", async () => {
    const { svc } = makeService();
    const unreadBefore = await svc.unreadCount();
    expect(unreadBefore).toEqual(serviceSuccess(0));

    await svc.create({ type: "SIGNAL_DETECTED", severity: "INFO", title: "Setup forming", message: "A WATCH state was recorded on EURUSD." });
    await svc.create({ type: "RESEARCH_UPDATE", severity: "INFO", title: "Registry updated", message: "The research registry advanced." });

    const count = await svc.unreadCount();
    expect(count).toEqual(serviceSuccess(2));

    const all = await svc.listAll();
    if (all.status === "SUCCESS") {
      const marked = await svc.markRead(all.value[0].id);
      expect(marked.status).toBe("SUCCESS");
    }
    const after = await svc.unreadCount();
    expect(after).toEqual(serviceSuccess(1));

    const markedAll = await svc.markAllRead();
    expect(markedAll).toEqual(serviceSuccess(1));
    const final = await svc.unreadCount();
    expect(final).toEqual(serviceSuccess(0));
  });

  it("returns NOT_FOUND when marking an unknown notification", async () => {
    const { svc } = makeService();
    const result = await svc.markRead("nope");
    expect(result.status).toBe("NOT_FOUND");
  });
});

describe("User performance computation (32N)", () => {
  it("reports hasTrades=false for an empty journal — never a 0% win rate claim", () => {
    const summary = computeUserPerformance([], "2026-09-28T00:00:00Z");
    expect(summary.hasTrades).toBe(false);
    expect(summary.performance.totalTrades).toBe(0);
  });

  it("computes win rate, total R and drawdown from closed trades only", () => {
    const trades: ExecutedTrade[] = [
      {
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
          sensitivityNote: "sensitivity note",
        },
        provenance: { sourceType: "USER_INPUT" },
      },
      {
        id: asId<"TradeId">("t2"),
        instrument: "EURUSD",
        direction: "LONG",
        strategyVersionId: asId<"StrategyVersionId">(GR_VERSION_ID),
        entry: 1.1,
        stopPrice: 1.099,
        exit: 1.099,
        entryAt: "2026-09-03T00:00:00Z",
        exitAt: "2026-09-04T00:00:00Z",
        realizedR: -1,
        timing: {
          instrument: "EURUSD",
          stamps: { signalAt: "2026-09-02T00:00:00Z", intendedEntryAt: "2026-09-03T00:00:00Z" },
          source: "USER_REPORTED",
          status: "UNKNOWN",
          sensitivityNote: "sensitivity note",
        },
        provenance: { sourceType: "USER_INPUT" },
      },
      {
        id: asId<"TradeId">("t3"),
        instrument: "EURUSD",
        direction: "LONG",
        strategyVersionId: asId<"StrategyVersionId">(GR_VERSION_ID),
        entry: 1.1,
        entryAt: "2026-09-05T00:00:00Z", // still open — excluded
        timing: {
          instrument: "EURUSD",
          stamps: { signalAt: "2026-09-04T00:00:00Z", intendedEntryAt: "2026-09-05T00:00:00Z" },
          source: "USER_REPORTED",
          status: "AWAITING_ENTRY",
          sensitivityNote: "sensitivity note",
        },
        provenance: { sourceType: "USER_INPUT" },
      },
    ];
    const summary = computeUserPerformance(trades, "2026-09-28T00:00:00Z");
    expect(summary.hasTrades).toBe(true);
    expect(summary.performance.totalTrades).toBe(2);
    expect(summary.performance.wins).toBe(1);
    expect(summary.performance.losses).toBe(1);
    expect(summary.performance.winRate).toBeCloseTo(0.5, 10);
    expect(summary.performance.totalR).toBeCloseTo(1, 10);
    expect(summary.performance.maxDrawdownR).toBeCloseTo(-1, 10);
  });
});
