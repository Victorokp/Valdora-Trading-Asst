import { describe, expect, it } from "vitest";

import { SIGNAL_STATES } from "@/domain/signals/signal";
import {
  LIFECYCLE_TO_VALIDITY,
  lifecycleToValidity,
} from "@/domain/signals/reconciliation";

describe("reconciliation #1: signal lifecycle vs signal validity", () => {
  it("maps every lifecycle state exactly once (total mapping)", () => {
    expect([...SIGNAL_STATES].sort()).toStrictEqual(Object.keys(LIFECYCLE_TO_VALIDITY).sort());
    expect(LIFECYCLE_TO_VALIDITY).toStrictEqual({
      NONE: "NO_SETUP",
      WATCH: "WATCH",
      CANDIDATE: "SETUP_FORMING",
      CONFIRMED: "VALID",
      INVALIDATED: "INVALIDATED",
      EXPIRED: "EXPIRED",
    });
  });

  it("is deterministic per state", () => {
    for (const state of SIGNAL_STATES) {
      expect(lifecycleToValidity(state)).toBe(LIFECYCLE_TO_VALIDITY[state]);
    }
  });

  it("keeps lifecycle and validity as distinct vocabularies (no merge)", () => {
    // The lifecycle has no TRIGGERED/CLOSED (order/position events belong to
    // the trading layer); the display vocabulary retains them.
    expect(SIGNAL_STATES).not.toContain("TRIGGERED");
    expect(SIGNAL_STATES).not.toContain("CLOSED");
    const validityValues = Object.values(LIFECYCLE_TO_VALIDITY);
    expect(validityValues).not.toContain("TRIGGERED");
    expect(validityValues).not.toContain("CLOSED");
  });
});
