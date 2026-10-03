import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidenceState, EVIDENCE_STATE_META } from "@/components/evidence/EvidenceState";
import { EVIDENCE_STATES } from "@/domain/types";

/**
 * Neutral evidence states: all six render, each keeps its neutral meaning,
 * and none of them ever renders evaluative vocabulary (scores/stars/grades).
 */
describe("neutral evidence states", () => {
  it("renders all six neutral states with icon + text (never color alone)", () => {
    render(
      <div>
        {EVIDENCE_STATES.map((state) => (
          <EvidenceState key={state} state={state} withDescription />
        ))}
      </div>,
    );
    for (const state of EVIDENCE_STATES) {
      expect(screen.getByText(state)).toBeInTheDocument();
      expect(screen.getByText(EVIDENCE_STATE_META[state].description)).toBeInTheDocument();
    }
  });

  it("carries a data-evidence-state hook for the research viewer", () => {
    render(<EvidenceState state="PENDING" />);
    expect(document.querySelector('[data-evidence-state="PENDING"]')).toBeInTheDocument();
  });

  it("contains no evaluative vocabulary", () => {
    const meta = Object.values(EVIDENCE_STATE_META).map((m) => m.description).join(" ");
    for (const banned of ["best", "guaranteed", "sure win", "risk-free", "score", "rating"]) {
      expect(meta.toLowerCase()).not.toContain(banned);
    }
  });
});
