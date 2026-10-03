/**
 * Candle-boundary assessment tests (32T Phase 6).
 *
 * Pins the mechanism that DETECTS and REPORTS boundary mismatches instead of
 * silently pretending provider daily candles equal the frozen research
 * convention — and pins that equality is never asserted while the research
 * boundary itself is undetermined.
 */
import { describe, expect, it } from "vitest";

import {
  RESEARCH_DAILY_BOUNDARY,
  assessAgainstResearch,
  boundariesInterchangeable,
  compareBoundaries,
  type CandleBoundaryDeclaration,
} from "@/domain/market/boundary";

const MASSIVE: CandleBoundaryDeclaration = {
  source: "Massive",
  providerStatement: "Daily windows begin at midnight Eastern, built from quoted bid/ask prices.",
  sourceTimezone: "America/New_York",
  confidence: "DOCUMENTED",
};

const UTC_SOURCE: CandleBoundaryDeclaration = {
  source: "OtherFeed",
  providerStatement: "Daily windows begin at midnight UTC.",
  sourceTimezone: "UTC",
  confidence: "DOCUMENTED",
};

const AMBIGUOUS: CandleBoundaryDeclaration = {
  source: "Twelve Data",
  providerStatement: "Datetime is the bar-open time in exchange-local time; exchange not stated for forex.",
  confidence: "AMBIGUOUS",
};

describe("compareBoundaries", () => {
  it("detects a DIFFERENT alignment when two sources state different timezones", () => {
    const result = compareBoundaries(MASSIVE, UTC_SOURCE);
    expect(result.alignment).toBe("DIFFERENT");
    expect(result.report).toContain("Candle-boundary mismatch detected");
    expect(result.report).toContain("America/New_York");
    expect(result.report).toContain("UTC");
    expect(result.report).toContain("must never be mixed");
  });

  it("returns UNKNOWN — never MATCH — when a timezone is not stated", () => {
    expect(compareBoundaries(MASSIVE, AMBIGUOUS).alignment).toBe("UNKNOWN");
    expect(compareBoundaries(AMBIGUOUS, AMBIGUOUS).alignment).toBe("UNKNOWN");
  });

  it("returns MATCH only for identical documented declarations", () => {
    expect(compareBoundaries(MASSIVE, { ...MASSIVE }).alignment).toBe("MATCH");
    expect(boundariesInterchangeable(MASSIVE, { ...MASSIVE })).toBe(true);
    expect(boundariesInterchangeable(MASSIVE, UTC_SOURCE)).toBe(false);
  });
});

describe("assessAgainstResearch", () => {
  it("reports alignment UNKNOWN against the undetermined research boundary", () => {
    const assessment = assessAgainstResearch(MASSIVE);
    expect(assessment.alignment).toBe("UNKNOWN");
    expect(assessment.researchConvention.source).toBe(RESEARCH_DAILY_BOUNDARY.source);
    expect(assessment.report).toContain("Massive");
    expect(assessment.report).toContain("Golden Reference");
    expect(assessment.report).toContain("preserved verbatim");
    expect(assessment.report).toContain("NOT verified equal");
  });

  it("flags an ambiguous provider boundary with its missing timezone", () => {
    const assessment = assessAgainstResearch(AMBIGUOUS);
    expect(assessment.alignment).toBe("UNKNOWN");
    expect(assessment.report).toContain("source timezone: not stated");
  });

  it("keeps the frozen research statement intact (never restated or softened)", () => {
    expect(RESEARCH_DAILY_BOUNDARY.providerStatement).toContain("vendor day boundary undetermined");
    expect(RESEARCH_DAILY_BOUNDARY.confidence).toBe("AMBIGUOUS");
  });
});
