import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ResearchPage from "@/pages/ResearchPage";

describe("ResearchPage (32H viewer)", () => {
  it("renders phase cards resolved from the ResearchService", async () => {
    render(<ResearchPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Phase 21 — Reconstruction & ledger")).toBeDefined();
    });
    expect(screen.getByLabelText("Phase 31 — Statistical evidence audit")).toBeDefined();
    expect(screen.getByLabelText("Phase 30 — Forward validation")).toBeDefined();
  });

  it("shows artifact-backed metrics pinned to frozen artifacts, not app-computed", async () => {
    render(<ResearchPage />);
    await waitFor(() => {
      expect(screen.getByText("+32.2644R @ 97.73rd")).toBeDefined();
    });
    expect(screen.getByText("2.27%")).toBeDefined();
    expect(screen.getAllByText(/not computed by this app/i).length).toBeGreaterThan(0);
  });

  it("renders the Phase 30 readiness panel with the registered gate and no assessed count", async () => {
    render(<ResearchPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Phase 30 readiness")).toBeDefined();
    });
    expect(screen.getAllByText("PENDING").length).toBeGreaterThan(0);
    expect(screen.getByText(/≥ 60 qualifying days after 2026-09-25/)).toBeDefined();
    expect(screen.getByText("—")).toBeDefined(); // assessed days: none
    expect(screen.getByText(/never fabricates progress/i)).toBeDefined();
  });

  it("states the D1 registry availability honestly (3 acquired, 3 not acquired)", async () => {
    render(<ResearchPage />);
    await waitFor(() => {
      expect(screen.getByText(/not yet acquired/i)).toBeDefined();
    });
  });

  it("keeps the neutral evidence vocabulary legend", () => {
    render(<ResearchPage />);
    expect(screen.getByText("Neutral evidence states")).toBeDefined();
    for (const state of ["SUPPORTED", "MIXED", "LIMITED", "INCONCLUSIVE", "PENDING", "UNKNOWN"]) {
      expect(screen.getAllByText(state).length).toBeGreaterThan(0);
    }
  });

  it("never renders banned evaluative wording", () => {
    const { container } = render(<ResearchPage />);
    // The neutral-vocabulary legend itself quotes banned labels in its
    // disclaimer; strip that sentence before scanning.
    const text = (container.textContent ?? "").replace(
      /evidence states are descriptive[\s\S]*?by design\./i,
      "",
    );
    for (const banned of ["strong buy", "guaranteed", "high confidence", "best strategy"]) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });
});
