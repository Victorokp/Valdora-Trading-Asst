import { describe, expect, it } from "vitest";

import { asId, type StrategyId, type StrategyVersionId } from "@/domain/ids";
import { createStrategyVersion, type Strategy, type StrategyVersion } from "@/domain/strategy/strategy";

const strategyId: StrategyId = asId<"StrategyId">("strategy-eurusd-gr");
const versionId: StrategyVersionId = asId<"StrategyVersionId">("EURUSD-GR-v1");

const version: StrategyVersion = {
  strategyId,
  versionId,
  versionLabel: "Golden Reference v1",
  effectiveDate: "2026-09-28",
  methodologyRef: "GR-v1 historical specification (frozen research)",
  parameters: {
    weeklyRegime: "EMA10>EMA20_AND_CLOSE>EMA20",
    dailyPullback: "LOW<=EMA20_AND_CLOSE>EMA20",
    stopAtrMultiple: 1,
    targetAtrMultiple: 2,
    warmupBars: 60,
  },
  researchProvenance: [
    {
      phase: "PHASE21",
      artifact: "phase21_trade_ledger (registered artifact)",
      evidenceState: "SUPPORTED",
      datasetHash: "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52",
    },
  ],
  frozen: true,
};

describe("strategy + strategy version", () => {
  it("builds a strategy pointing at its current version", () => {
    const strategy: Strategy = {
      id: strategyId,
      name: "EURUSD Golden Reference",
      description: "Frozen Phase-21 lineage strategy.",
      status: "ACTIVE",
      createdAt: "2026-09-28",
      currentVersionId: versionId,
    };
    expect(strategy.currentVersionId).toBe(versionId);
    expect(strategy.status).toBe("ACTIVE");
  });

  it("keeps parameters as configuration data, not logic", () => {
    expect(version.parameters.stopAtrMultiple).toBe(1);
    expect(version.parameters.targetAtrMultiple).toBe(2);
  });

  it("requires research provenance on frozen versions", () => {
    expect(createStrategyVersion(version)).toBe(version);
    expect(() =>
      createStrategyVersion({ ...version, researchProvenance: [] }),
    ).toThrow(/frozen strategy version must cite research provenance/);
  });
});
