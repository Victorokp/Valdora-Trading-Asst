import { describe, expect, it } from "vitest";

import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@/domain/preferences/preferences";

describe("user preferences", () => {
  it("provides a neutral default set with no market assumptions", () => {
    expect(DEFAULT_USER_PREFERENCES.preferredInstrument).toBeUndefined();
    expect(DEFAULT_USER_PREFERENCES.preferredTimeframe).toBeUndefined();
    expect(DEFAULT_USER_PREFERENCES.chart.showEvidenceBadges).toBe(true);
    expect(DEFAULT_USER_PREFERENCES.ai.alwaysShowCitations).toBe(true);
    expect(DEFAULT_USER_PREFERENCES.riskDisplay.showCalculationInputs).toBe(true);
  });

  it("accepts a full preference record with optional instrument/timeframe", () => {
    const prefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      preferredInstrument: "EURUSD",
      preferredTimeframe: "DAILY",
    };
    expect(prefs.preferredInstrument).toBe("EURUSD");
    expect(prefs.preferredTimeframe).toBe("DAILY");
  });
});
