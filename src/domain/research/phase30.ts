/**
 * Phase 30 readiness domain (32D).
 *
 * A domain representation of research *readiness* — not research results.
 * The current known state is PENDING because A1 has not reached the
 * ≥60-qualifying-day gate. This module never invents dates, counts or
 * outcomes: the numbers it carries are either supplied from a verified
 * research artifact or absent.
 *
 * Pure domain: no dataset access, no clock-derived decisions.
 */

/** Readiness lifecycle of a preregistered research phase. */
export const RESEARCH_READINESS_STATES = ["PENDING", "ELIGIBLE", "EXECUTED", "CLOSED"] as const;
export type ResearchReadinessState = (typeof RESEARCH_READINESS_STATES)[number];

/**
 * The registered A1 eligibility gate (G1): ≥60 qualifying EURUSD daily
 * trading days strictly after the cutoff. Constants mirror the Phase-30
 * protocol as configuration data — the app never re-derives them.
 */
export const A1_REGISTERED = {
  minQualifyingDays: 60,
  cutoffDate: "2026-09-25",
} as const;

/**
 * Phase 30 readiness record. When the state is PENDING, eligibility counts
 * are undefined unless a verified artifact supplied them — and even then they
 * are recorded as *observed counts*, never as a progress claim or a forecast.
 */
export interface Phase30Readiness {
  readonly state: ResearchReadinessState;
  /** What the state means, in one factual sentence. */
  readonly rationale: string;
  /**
   * Observed qualifying-day count, only when actually assessed from
   * verified data. Undefined = not assessed. Never fabricated.
   */
  readonly observedQualifyingDays?: number;
  /** The registered gate this readiness refers to. */
  readonly gate: {
    readonly minQualifyingDays: number;
    readonly cutoffDate: string;
  };
}

/** The current, honestly-known Phase 30 state: PENDING, nothing assessed. */
export const PHASE30_CURRENT_READINESS: Phase30Readiness = {
  state: "PENDING",
  rationale:
    "A1 has not reached the registered gate of 60 qualifying trading days strictly after 2026-09-25.",
  gate: {
    minQualifyingDays: A1_REGISTERED.minQualifyingDays,
    cutoffDate: A1_REGISTERED.cutoffDate,
  },
};

/** Construct a readiness record; refuses a count on PENDING (counting requires assessment). */
export function phase30Readiness(
  state: ResearchReadinessState,
  rationale: string,
  observedQualifyingDays?: number,
): Phase30Readiness {
  if (state === "PENDING" && observedQualifyingDays !== undefined) {
    throw new Error("a PENDING phase cannot carry an assessed qualifying-day count");
  }
  return {
    state,
    rationale,
    observedQualifyingDays,
    gate: {
      minQualifyingDays: A1_REGISTERED.minQualifyingDays,
      cutoffDate: A1_REGISTERED.cutoffDate,
    },
  };
}
