import { describe, expect, it } from "vitest";

import type { AIContext, AIResponse } from "@/domain/ai/context";
import type { MarketSnapshot } from "@/domain/market/snapshot";
import { UNPROVENANCED } from "@/domain/provenance/provenance";
import type { ResearchRef } from "@/domain/research/evidence";

const ref: ResearchRef = {
  phase: "PHASE30",
  artifact: "PHASE30_EXPERIMENT_REGISTRY.md",
  evidenceState: "PENDING",
  limitation: "A1 gate not yet reached; no forward result exists.",
};

const snapshot: MarketSnapshot = {
  instrument: "EURUSD",
  provenance: UNPROVENANCED,
};

describe("AI context contract", () => {
  it("builds a context from structured, cited inputs only", () => {
    const context: AIContext = {
      userQuestion: "What does the research say about execution delay?",
      researchReferences: [ref],
      marketContext: { snapshots: [snapshot], analyses: [] },
      uncertaintyFlags: [{ kind: "PENDING_RESEARCH", detail: "Phase 30 A1 is pending." }],
      limitations: ["Execution timing is materially sensitive."],
      responseMode: "EXPLAIN",
    };
    expect(context.researchReferences[0].evidenceState).toBe("PENDING");
    expect(context.uncertaintyFlags[0].kind).toBe("PENDING_RESEARCH");
    expect(context.responseMode).toBe("EXPLAIN");
  });

  it("marks AI output as non-authoritative explanation with citations", () => {
    const response: AIResponse = {
      explanation: "Phase 30 has not produced results yet; the registry is preregistered.",
      citedRefs: [ref],
      acknowledgedUncertainty: ["PENDING_RESEARCH"],
      responseMode: "EXPLAIN",
    };
    expect(response.citedRefs[0]).toBe(ref);
    expect(response.acknowledgedUncertainty).toContain("PENDING_RESEARCH");
    // No fabricated market values on the response shape.
    expect("price" in response).toBe(false);
    expect("signal" in response).toBe(false);
  });
});
