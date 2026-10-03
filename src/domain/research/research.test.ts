import { describe, expect, it } from "vitest";

import { EVIDENCE_STATES, type ResearchRef } from "@/domain/research/evidence";
import {
  A1_REGISTERED,
  PHASE30_CURRENT_READINESS,
  phase30Readiness,
} from "@/domain/research/phase30";

describe("evidence states", () => {
  it("supports exactly the six neutral states", () => {
    expect([...EVIDENCE_STATES]).toStrictEqual([
      "SUPPORTED",
      "MIXED",
      "LIMITED",
      "INCONCLUSIVE",
      "PENDING",
      "UNKNOWN",
    ]);
  });
});

describe("research references", () => {
  it("carries artifact provenance for display and integrity pinning", () => {
    const ref: ResearchRef = {
      phase: "PHASE31",
      artifact: "B1_summary_CORRECTED.json",
      evidenceState: "SUPPORTED",
      commit: "03f9561",
      artifactHash: "7f0d215e2026b8576efd54e228b748820b251f16bc4670ce4745c4c7791217cc",
      limitation: "Historical sample only; forward validation outstanding.",
    };
    expect(ref.phase).toBe("PHASE31");
    expect(ref.evidenceState).toBe("SUPPORTED");
    expect(ref.limitation).toContain("forward validation outstanding");
  });
});

describe("phase 30 readiness", () => {
  it("mirrors the registered A1 gate constants", () => {
    expect(A1_REGISTERED.minQualifyingDays).toBe(60);
    expect(A1_REGISTERED.cutoffDate).toBe("2026-09-25");
  });

  it("represents the current state as PENDING with no fabricated counts", () => {
    expect(PHASE30_CURRENT_READINESS.state).toBe("PENDING");
    expect(PHASE30_CURRENT_READINESS.observedQualifyingDays).toBeUndefined();
    expect(PHASE30_CURRENT_READINESS.gate).toStrictEqual({ minQualifyingDays: 60, cutoffDate: "2026-09-25" });
  });

  it("refuses an assessed count while PENDING", () => {
    expect(() => phase30Readiness("PENDING", "still waiting", 42)).toThrow(
      /PENDING phase cannot carry an assessed qualifying-day count/,
    );
  });

  it("allows an assessed count only for assessed states", () => {
    const eligible = phase30Readiness("ELIGIBLE", "gate reached", 61);
    expect(eligible.state).toBe("ELIGIBLE");
    expect(eligible.observedQualifyingDays).toBe(61);
  });
});
