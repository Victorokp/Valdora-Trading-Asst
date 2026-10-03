import { describe, expect, it } from "vitest";

import { asId } from "@/domain/ids";
import {
  SIGNAL_STATES,
  type ExecutionTimingContext,
  type IntendedEntry,
  type Signal,
} from "@/domain/signals/signal";
import {
  EXECUTION_SENSITIVITY_NOTE,
  deriveTimingStatus,
  type TimingStamps,
} from "@/domain/trading/executionTiming";

const timing: ExecutionTimingContext = {
  signalAt: "2026-09-25",
  intendedEntryAt: "2026-09-28",
  sensitivityNote: EXECUTION_SENSITIVITY_NOTE,
};

const intendedEntry: IntendedEntry = {
  timing: "NEXT_BAR_OPEN",
  stopPrice: 1.09,
  targetPrice: 1.13,
};

const signal: Signal = {
  id: asId<"SignalId">("signal-1"),
  instrument: "EURUSD",
  timeframe: "DAILY",
  direction: "LONG",
  strategyId: asId<"StrategyId">("strategy-eurusd-gr"),
  strategyVersionId: asId<"StrategyVersionId">("EURUSD-GR-v1"),
  createdAt: "2026-09-25",
  evidence: [],
  intendedEntry,
  invalidationCondition: "daily close below EMA50",
  timing,
  dataProvenance: { sourceType: "MARKET_DATA_PROVIDER", sourceName: "test-provider" },
};

describe("signal states", () => {
  it("supports exactly the six canonical lifecycle states", () => {
    expect([...SIGNAL_STATES]).toStrictEqual([
      "NONE",
      "WATCH",
      "CANDIDATE",
      "CONFIRMED",
      "INVALIDATED",
      "EXPIRED",
    ]);
  });

  it("creates a fully traceable signal record", () => {
    expect(signal.strategyVersionId).toBe("EURUSD-GR-v1");
    expect(signal.instrument).toBe("EURUSD");
    expect(signal.timing.signalAt).toBe("2026-09-25");
    expect(signal.intendedEntry.timing).toBe("NEXT_BAR_OPEN");
    expect(signal.invalidationCondition).toContain("EMA50");
  });

  it("carries the standing timing-sensitivity note (no robustness claims)", () => {
    expect(signal.timing.sensitivityNote).toBe(EXECUTION_SENSITIVITY_NOTE);
    expect(EXECUTION_SENSITIVITY_NOTE).toMatch(/material sensitivity to execution delay/);
    expect(EXECUTION_SENSITIVITY_NOTE.toLowerCase()).not.toContain("robust");
  });
});

describe("execution timing status", () => {
  const stamps: TimingStamps = {
    signalAt: "2026-09-25",
    intendedEntryAt: "2026-09-28",
  };

  it("is AWAITING_ENTRY when no actual entry is known", () => {
    expect(deriveTimingStatus(stamps)).toBe("AWAITING_ENTRY");
  });

  it("is UNKNOWN when entry is known but delay is not", () => {
    expect(deriveTimingStatus({ ...stamps, actualEntryAt: "2026-09-28" })).toBe("UNKNOWN");
  });

  it("is ENTRY_ON_TIME for a zero delay", () => {
    expect(deriveTimingStatus({ ...stamps, actualEntryAt: "2026-09-28" }, { bars: 0 })).toBe("ENTRY_ON_TIME");
  });

  it("is ENTRY_DELAYED for bar or clock delay", () => {
    expect(deriveTimingStatus({ ...stamps, actualEntryAt: "2026-09-29" }, { bars: 1 })).toBe("ENTRY_DELAYED");
    expect(
      deriveTimingStatus({ ...stamps, actualEntryAt: "2026-09-29" }, { duration: "PT26H" }),
    ).toBe("ENTRY_DELAYED");
  });
});
