/**
 * VALDORA domain types.
 *
 * 32D note: this file is the compatibility surface for existing consumers.
 * Canonical definitions now live in their domain modules and are re-exported
 * here so no type exists twice:
 * - Evidence states / ResearchRef  → @/domain/research/evidence
 * - Timeframe                      → @/domain/market/timeframe
 * - Instrument model               → @/domain/instruments/instrument
 */

// --- Re-exported canonical types (single source of truth) -------------------

export {
  EVIDENCE_STATES,
  type EvidenceState,
  type EvidenceAssessment,
  type ResearchRef,
} from "@/domain/research/evidence";

export type { Timeframe } from "@/domain/market/timeframe";

// --- Core primitives ---------------------------------------------------------

export type Direction = "LONG" | "SHORT";

/** Instrument validation level — factual lineage only, never a quality score. */
export type ValidationLevel = "RESEARCH_BACKED" | "NOT_INDEPENDENTLY_VALIDATED";

export interface InstrumentRef {
  symbol: string;
  label: string;
  validation: ValidationLevel;
}

/**
 * The architecture's eight-state signal-validity vocabulary (Part 1 §11).
 * Kept for the Strategy page's explainability vocabulary; the 32D signal
 * lifecycle uses the six-state canonical union in @/domain/signals/signal.
 */
export type SignalValidity =
  | "NO_SETUP"
  | "WATCH"
  | "SETUP_FORMING"
  | "VALID"
  | "INVALIDATED"
  | "EXPIRED"
  | "TRIGGERED"
  | "CLOSED";

/** The five required UI states for every data-dependent view (Part 2 §17). */
export type DataState = "LOADING" | "SUCCESS" | "EMPTY" | "ERROR" | "UNAVAILABLE";

export type MarketSessionStatus = "OPEN" | "CLOSED" | "UNKNOWN";
