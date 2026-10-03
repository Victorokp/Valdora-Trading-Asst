import { describe, expect, it } from "vitest";

import { asId } from "@/domain/ids";
import {
  EXECUTION_SENSITIVITY_NOTE,
  type ExecutionTiming,
} from "@/domain/trading/executionTiming";
import type { PlannedTrade, ExecutedTrade } from "@/domain/trading/trade";
import {
  compileUserPerformance,
  type HistoricalResearchPerformance,
  type UserTradeOutcome,
} from "@/domain/performance/performance";

const timing: ExecutionTiming = {
  instrument: "EURUSD",
  stamps: { signalAt: "2026-09-25", intendedEntryAt: "2026-09-28", actualEntryAt: "2026-09-28" },
  source: "USER_REPORTED",
  status: "ENTRY_ON_TIME",
  sensitivityNote: EXECUTION_SENSITIVITY_NOTE,
};

const planned: PlannedTrade = {
  id: asId<"PlannedTradeId">("plan-1"),
  instrument: "EURUSD",
  direction: "LONG",
  signalId: asId<"SignalId">("signal-1"),
  strategyVersionId: asId<"StrategyVersionId">("EURUSD-GR-v1"),
  intendedEntry: 1.1,
  stopPrice: 1.09,
  targetPrice: 1.13,
  createdAt: "2026-09-25",
};

const executed: ExecutedTrade = {
  id: asId<"TradeId">("trade-1"),
  instrument: "EURUSD",
  direction: "LONG",
  signalId: asId<"SignalId">("signal-1"),
  strategyVersionId: asId<"StrategyVersionId">("EURUSD-GR-v1"),
  entry: 1.1005,
  stopPrice: 1.09,
  targetPrice: 1.13,
  exit: 1.13,
  entryAt: "2026-09-28",
  exitAt: "2026-10-02",
  realizedR: 2,
  timing,
  provenance: { sourceType: "USER_INPUT", sourceName: "user journal entry" },
};

describe("planned vs executed trades", () => {
  it("keeps a planned trade hypothetical (no exit/realized R fields)", () => {
    expect("exit" in planned).toBe(false);
    expect("realizedR" in planned).toBe(false);
    expect(planned.signalId).toBe("signal-1");
  });

  it("keeps an executed trade grounded in reported facts", () => {
    expect(executed.realizedR).toBe(2);
    expect(executed.exit).toBe(1.13);
    expect(executed.timing.source).toBe("USER_REPORTED");
    expect(executed.provenance.sourceType).toBe("USER_INPUT");
  });

  it("does not treat a planned trade as an executed trade (distinct shapes)", () => {
    const keys = Object.keys(planned);
    expect(keys).not.toContain("realizedR");
    expect(keys).not.toContain("provenance");
    expect(Object.keys(executed)).toContain("realizedR");
  });
});

describe("performance separation", () => {
  const outcomes: UserTradeOutcome[] = [
    { tradeId: "t1", outcome: "LOSS", realizedR: -1, exitAt: "2026-01-02" },
    { tradeId: "t2", outcome: "LOSS", realizedR: -1, exitAt: "2026-01-03" },
    { tradeId: "t3", outcome: "WIN", realizedR: 2, exitAt: "2026-01-06" },
    { tradeId: "t4", outcome: "WIN", realizedR: 2, exitAt: "2026-01-10" },
    { tradeId: "t5", outcome: "LOSS", realizedR: -1, exitAt: "2026-01-13" },
  ];

  it("compiles user performance deterministically from journal outcomes only", () => {
    const perf = compileUserPerformance(outcomes, "2026-09-28T00:00:00Z");
    expect(perf.totalTrades).toBe(5);
    expect(perf.wins).toBe(2);
    expect(perf.losses).toBe(3);
    expect(perf.winRate).toBeCloseTo(0.4, 10);
    expect(perf.totalR).toBe(1);
    expect(perf.averageR).toBeCloseTo(0.2, 10);
    expect(perf.maxDrawdownR).toBe(-2);
    expect(perf.longestLosingStreak).toBe(2);
    expect(perf.profitFactor).toBeCloseTo(4 / 3, 10);
    expect(perf.fromTradeIds).toStrictEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  it("handles an empty journal without fabricating numbers", () => {
    const perf = compileUserPerformance([], "2026-09-28T00:00:00Z");
    expect(perf.totalTrades).toBe(0);
    expect(perf.totalR).toBe(0);
    expect(perf.maxDrawdownR).toBe(0);
    expect(perf.longestLosingStreak).toBe(0);
  });

  it("keeps historical research performance a distinct, cited shape", () => {
    const historical: HistoricalResearchPerformance = {
      totalTrades: 115,
      winRate: 0.4956,
      profitFactor: 1.83,
      totalR: 32.2644,
      maxDrawdownR: -12,
      longestLosingStreak: 6,
      source: {
        phase: "PHASE21",
        artifact: "phase21_trade_ledger (registered artifact)",
        evidenceState: "SUPPORTED",
        datasetHash: "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52",
      },
      limitations: ["Historical sample only", "Forward validation outstanding"],
    };
    // Distinct types: a UserTradePerformance has fromTradeIds/computedAt; a
    // HistoricalResearchPerformance has source/limitations. They are not
    // assignable to each other.
    expect(historical.source.phase).toBe("PHASE21");
    expect(historical.limitations.length).toBeGreaterThan(0);
    const user = compileUserPerformance(outcomes, "2026-09-28T00:00:00Z");
    expect("source" in user).toBe(false);
    expect("fromTradeIds" in historical).toBe(false);
  });
});
