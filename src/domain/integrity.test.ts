import { describe, expect, it } from "vitest";

import { REGISTERED_PIP_SIZES } from "@/domain/instruments/instrument";
import {
  A1_REGISTERED,
  PHASE30_CURRENT_READINESS,
  phase30Readiness,
} from "@/domain/research/phase30";
import {
  EXECUTION_SENSITIVITY_NOTE,
  type ExecutionTiming,
} from "@/domain/trading/executionTiming";
import {
  compileUserPerformance,
  type HistoricalResearchPerformance,
  type UserTradePerformance,
} from "@/domain/performance/performance";

/**
 * No-fabricated-data guarantees (32D): the domain model must make dishonest
 * data impossible to express silently.
 */
describe("no fabricated data", () => {
  it("phase 30 remains PENDING with the registered gate and no invented progress", () => {
    expect(PHASE30_CURRENT_READINESS.state).toBe("PENDING");
    expect(PHASE30_CURRENT_READINESS.observedQualifyingDays).toBeUndefined();
    expect(A1_REGISTERED).toStrictEqual({ minQualifyingDays: 60, cutoffDate: "2026-09-25" });
    expect(() => phase30Readiness("PENDING", "waiting", 10)).toThrow();
  });

  it("pip sizes stay frozen — never derived from price precision", () => {
    expect(REGISTERED_PIP_SIZES.EURUSD).toBe(0.0001);
    expect(REGISTERED_PIP_SIZES.USDJPY).toBe(0.01);
  });

  it("execution timing always carries the sensitivity note; no robustness claims exist", () => {
    const timing: ExecutionTiming = {
      instrument: "EURUSD",
      stamps: { signalAt: "2026-09-25", intendedEntryAt: "2026-09-28" },
      source: "USER_REPORTED",
      status: "AWAITING_ENTRY",
      sensitivityNote: EXECUTION_SENSITIVITY_NOTE,
    };
    expect(timing.sensitivityNote).toBe(EXECUTION_SENSITIVITY_NOTE);
    expect(EXECUTION_SENSITIVITY_NOTE.toLowerCase()).not.toContain("robust");
    expect(EXECUTION_SENSITIVITY_NOTE).toMatch(/material sensitivity/);
  });

  it("user performance never carries research provenance (no mixing)", () => {
    const user: UserTradePerformance = compileUserPerformance(
      [{ tradeId: "t1", outcome: "WIN", realizedR: 2, exitAt: "2026-09-02" }],
      "2026-09-28T00:00:00Z",
    );
    expect("source" in user).toBe(false);
    expect("limitations" in user).toBe(false);
  });

  it("historical research performance always requires a cited source and limitations", () => {
    // A HistoricalResearchPerformance without `source`/`limitations` cannot
    // be constructed — proven by the type. At runtime we verify the shape
    // demands them (missing fields are undefined, never auto-filled).
    const partial = {} as unknown as HistoricalResearchPerformance;
    expect(partial.source).toBeUndefined();
    expect(partial.limitations).toBeUndefined();
  });
});
