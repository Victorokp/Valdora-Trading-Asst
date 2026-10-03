/**
 * Research evidence domain (32D).
 *
 * The neutral evidence vocabulary and provenance records that let the
 * application show exactly where a research claim came from. No scores,
 * stars, rankings, grades, "best"/"worst" — the type system makes such
 * renderings unrepresentable: an EvidenceState is one of six neutral literals
 * and nothing else.
 *
 * Pure domain: knows nothing about how research was produced.
 */

/** The six neutral evidence states (architecture Part 2 §3). Exactly these; never extended lightly. */
export const EVIDENCE_STATES = [
  "SUPPORTED",
  "MIXED",
  "LIMITED",
  "INCONCLUSIVE",
  "PENDING",
  "UNKNOWN",
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/**
 * Evidence assessment: the state plus an optional factual summary.
 * Deliberately carries no numeric score, grade or ranking field.
 */
export interface EvidenceAssessment {
  readonly state: EvidenceState;
  readonly summary?: string;
  /** When the state was assigned (ISO-8601), if recorded. */
  readonly assessedAt?: string;
}

/**
 * ResearchRef — provenance of a research claim (architecture Part 2 §6).
 * Lets the UI identify exactly which evidence version it displays, and lets
 * integrity tests pin displayed claims to committed artifacts.
 */
export interface ResearchRef {
  /** Research phase identifier, e.g. "PHASE31". */
  readonly phase: string;
  /** Which experiment family within the phase, when applicable (A1, B1, C3…). */
  readonly family?: string;
  /** Artifact name, e.g. "B1_summary_CORRECTED.json". */
  readonly artifact: string;
  /** Metric the claim refers to (e.g. "observed_total_R"), when applicable. */
  readonly metric?: string;
  /** Neutral state of the evidence. */
  readonly evidenceState: EvidenceState;
  /** Commit that pins the artifact (short or full SHA). */
  readonly commit?: string;
  /** Dataset hash where the claim depends on a dataset. */
  readonly datasetHash?: string;
  /** Artifact content hash where known. */
  readonly artifactHash?: string;
  /** ISO-8601 date associated with the artifact. */
  readonly date?: string;
  /** Limitation note. Limitations are data, not decoration. */
  readonly limitation?: string;
}

/** A research phase's status as exposed by the ResearchService contract. */
export type ResearchPhaseStatus = "PREREGISTERED" | "IN_PROGRESS" | "EXECUTED" | "CLOSED" | "UNKNOWN";

export interface ResearchPhaseSummary {
  readonly id: string;
  readonly title: string;
  readonly status: ResearchPhaseStatus;
  readonly evidenceState: EvidenceState;
  readonly summary?: string;
  readonly limitations: readonly string[];
}
