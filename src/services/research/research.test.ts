import { describe, expect, it } from "vitest";

import { RESEARCH_COMMITS, RESEARCH_REGISTRY } from "@/services/research/registry";
import { StaticResearchService } from "@/services/research";

const service = new StaticResearchService();

describe("static research service (32G boundary)", () => {
  it("lists all registered phases with neutral states", async () => {
    const result = await service.listPhases();
    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.value.map((p) => p.id)).toStrictEqual([
        "phase21", "phase27", "phase28", "phase29", "phase30", "phase31",
      ]);
      expect(result.value.map((p) => p.evidenceState)).toStrictEqual([
        "SUPPORTED", "LIMITED", "MIXED", "MIXED", "PENDING", "MIXED",
      ]);
    }
  });

  it("returns NOT_FOUND for unknown phases (no invented summaries)", async () => {
    const result = await service.getPhase("phase42");
    expect(result.status).toBe("NOT_FOUND");
  });

  it("serves the six-block description with mandatory limitations", async () => {
    const result = await service.getPhaseDescription("phase31");
    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.value.limitations).toContain(
        "NOT a definitive strategy p-value (preregistered guard).",
      );
      expect(result.value.purpose.length).toBeGreaterThan(0);
      expect(result.value.methodology).toContain("B1 corrected");
    }
  });

  it("pins Phase 31 B1 metrics to the corrected artifact with its hash and guard", async () => {
    const result = await service.getPhaseMetrics("phase31");
    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      const observed = result.value.find((m) => m.label.startsWith("Observed total R"));
      expect(observed?.value).toBe("+32.2644R @ 97.73rd");
      expect(observed?.ref.commit).toBe(RESEARCH_COMMITS.phase31B1Correction);
      expect(observed?.ref.artifactHash).toMatch(/^7f0d215e/);
      expect(observed?.ref.limitation).toContain("not a definitive strategy p-value");
    }
  });

  it("mirrors Phase 30 readiness from the domain constant (PENDING, no counts)", async () => {
    const result = await service.getPhase30Readiness();
    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.value.state).toBe("PENDING");
      expect(result.value.observedQualifyingDays).toBeUndefined();
      expect(result.value.gate).toStrictEqual({ minQualifyingDays: 60, cutoffDate: "2026-09-25" });
    }
  });

  it("returns evidence assessments derived only from registry refs", async () => {
    const result = await service.getPhaseEvidence("phase29");
    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.value.length).toBeGreaterThan(0);
      for (const assessment of result.value) {
        expect(assessment.state).toBe("MIXED");
        expect(assessment.summary).toContain("@");
      }
    }
  });

  it("keeps every registry artifact hash exact (corrected B1)", () => {
    const refs = RESEARCH_REGISTRY.phase31.description.refs;
    const b1 = refs.find((r) => r.artifact === "B1_summary_CORRECTED.json");
    expect(b1?.artifactHash).toBe("7f0d215e2026b8576efd54e228b748820b251f16bc4670ce4745c4c7791217cc");
    expect(b1?.commit).toBe("03f9561");
  });
});
