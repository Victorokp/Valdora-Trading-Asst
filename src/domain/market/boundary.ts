/**
 * Candle-boundary semantics assessment (32T Phase 6).
 *
 * Live provider daily candles are NOT assumed equal to the research Golden
 * Reference daily candles: they may differ by timezone, broker/server day
 * boundary, bid/ask construction, aggregation methodology and weekend/holiday
 * handling. This module is the mechanism that DECLARES a provider's boundary,
 * compares boundaries between sources, and reports mismatch risk instead of
 * silently pretending providers are identical.
 *
 * Pure domain: no I/O, no provider imports, no research-engine coupling.
 * The historical research engine is never altered to accommodate live data.
 */
/** Provider-declared candle-boundary semantics, recorded verbatim. */
export interface CandleBoundaryInfo {
  /** Verbatim (or documentation-derived) statement of how candles are built. */
  readonly providerStatement: string;
  /** Source timezone declared by the provider, when stated. */
  readonly sourceTimezone?: string;
  /** DOCUMENTED = provider docs state the boundary; AMBIGUOUS = not conclusively stated. */
  readonly confidence: "DOCUMENTED" | "AMBIGUOUS";
}

/** A boundary declaration tagged with the source it belongs to. */
export interface CandleBoundaryDeclaration extends CandleBoundaryInfo {
  /** Source identity, e.g. provider label or research artifact name. */
  readonly source: string;
}

/**
 * The frozen research convention (statement only — the research engine is
 * never read or modified by the application):
 * Golden Reference daily rows are plain calendar dates and the vendor day
 * boundary is UNDETERMINED (VALDORA EURUSD boundary forensics). Therefore
 * equality between any provider boundary and the research convention cannot
 * be asserted — only reported as unverified.
 */
export const RESEARCH_DAILY_BOUNDARY: CandleBoundaryDeclaration = {
  source: "Golden Reference (frozen research)",
  providerStatement:
    "Plain calendar dates; vendor day boundary undetermined (dataset provenance/vendor not established).",
  confidence: "AMBIGUOUS",
};

export type BoundaryAlignment = "MATCH" | "DIFFERENT" | "UNKNOWN";

export interface BoundaryComparison {
  readonly left: CandleBoundaryDeclaration;
  readonly right: CandleBoundaryDeclaration;
  readonly alignment: BoundaryAlignment;
  readonly report: string;
}

/**
 * Compare two boundary declarations. A mismatch is DETECTED (DIFFERENT) only
 * when both sources state a timezone and the timezones disagree; without two
 * stated timezones the honest outcome is UNKNOWN, never MATCH — equality is
 * never assumed.
 */
export function compareBoundaries(
  left: CandleBoundaryDeclaration,
  right: CandleBoundaryDeclaration,
): BoundaryComparison {
  const leftTz = left.sourceTimezone;
  const rightTz = right.sourceTimezone;
  if (leftTz !== undefined && rightTz !== undefined && leftTz !== rightTz) {
    return {
      left,
      right,
      alignment: "DIFFERENT",
      report:
        `Candle-boundary mismatch detected: ${left.source} declares source timezone ${leftTz}, ` +
        `${right.source} declares ${rightTz}. Daily candles from these sources are not interchangeable; ` +
        "series from different sources must never be mixed in one calculation.",
    };
  }
  if (
    leftTz !== undefined &&
    rightTz !== undefined &&
    leftTz === rightTz &&
    left.providerStatement === right.providerStatement &&
    left.confidence === "DOCUMENTED" &&
    right.confidence === "DOCUMENTED"
  ) {
    return {
      left,
      right,
      alignment: "MATCH",
      report: `Both sources declare identical documented candle boundaries (timezone ${leftTz}).`,
    };
  }
  return {
    left,
    right,
    alignment: "UNKNOWN",
    report:
      `Candle-boundary equality between ${left.source} and ${right.source} is UNVERIFIED ` +
      "(one or both boundaries are not conclusively documented). Treat cross-source comparisons as unverified.",
  };
}

export interface BoundaryAssessment {
  readonly declaration: CandleBoundaryDeclaration;
  readonly researchConvention: CandleBoundaryDeclaration;
  /** Always reported against the frozen research convention's knowledge state. */
  readonly alignment: BoundaryAlignment;
  readonly report: string;
}

/**
 * Assess one provider boundary against the frozen research convention.
 * While the research boundary itself is undetermined (AMBIGUOUS), the
 * alignment can only be UNKNOWN — the report makes that explicit and keeps
 * both statements side by side instead of merging them.
 */
export function assessAgainstResearch(
  declaration: CandleBoundaryDeclaration,
  research: CandleBoundaryDeclaration = RESEARCH_DAILY_BOUNDARY,
): BoundaryAssessment {
  // The research boundary is undetermined, so alignment can only be UNKNOWN:
  // equality is never asserted, and a mismatch is reported rather than assumed.
  const alignment: BoundaryAlignment = "UNKNOWN";
  const report =
    `Provider ${declaration.source}: ${declaration.providerStatement}` +
    `${declaration.sourceTimezone ? ` (source timezone: ${declaration.sourceTimezone})` : " (source timezone: not stated)"}. ` +
    `Research convention (${research.source}): ${research.providerStatement} ` +
    `Boundary alignment: ${alignment} — provider candle boundaries are NOT verified equal to the research ` +
    "daily candles; provider timestamps are preserved verbatim and never re-stamped.";
  return { declaration, researchConvention: research, alignment, report };
}

/**
 * Guard used by the router before a dataset reaches analysis: within one
 * calculation every bar must carry identical timestamp semantics. This check
 * compares declarations; the bar-level uniqueness/ordering rules live in the
 * quality gate.
 */
export function boundariesInterchangeable(a: CandleBoundaryDeclaration, b: CandleBoundaryDeclaration): boolean {
  return compareBoundaries(a, b).alignment === "MATCH";
}
