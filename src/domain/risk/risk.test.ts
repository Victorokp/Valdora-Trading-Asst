import { describe, expect, it } from "vitest";

import {
  RISK_STATUSES,
  type DrawdownSummary,
  type ExposureSummary,
  type GuardrailCheck,
  type RiskState,
} from "@/domain/risk/risk";

describe("risk states", () => {
  it("supports exactly the four neutral statuses", () => {
    expect([...RISK_STATUSES]).toStrictEqual(["NORMAL", "WARNING", "BLOCKED", "UNKNOWN"]);
  });

  it("builds a guardrail check with a factual message", () => {
    const check: GuardrailCheck = {
      limit: "maxConcurrentTrades",
      status: "NORMAL",
      message: "1 open trade of max 3",
    };
    expect(check.status).toBe("NORMAL");
    expect(check.message).toContain("1 open trade");
  });

  it("builds an aggregate risk state from guardrail checks", () => {
    const state: RiskState = {
      guardrails: [
        { limit: "maxRiskPerTrade", status: "NORMAL", message: "0.5% of max 1%" },
        { limit: "maxOpenExposureR", status: "WARNING", message: "2.5R open of 3R max" },
      ],
      guardrailStatus: "WARNING",
      status: "WARNING",
    };
    expect(state.guardrailStatus).toBe("WARNING");
    expect(state.guardrails).toHaveLength(2);
  });

  it("keeps exposure and drawdown summaries factual and optional", () => {
    const exposure: ExposureSummary = { openTrades: 2, openExposureR: 2, status: "NORMAL" };
    const drawdown: DrawdownSummary = { maxDrawdownR: -12, status: "WARNING" };
    expect(exposure.status).toBe("NORMAL");
    expect(drawdown.maxDrawdownR).toBe(-12);
    expect(drawdown.currentDrawdownR).toBeUndefined();
  });
});
