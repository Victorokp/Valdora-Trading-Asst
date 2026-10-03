/**
 * Architectural reconciliation #1 (32E): signal LIFECYCLE vs signal VALIDITY.
 *
 * History: the architecture (Part 1 §11) defines an eight-value
 * `SignalValidity` display vocabulary; 32D introduced the canonical six-state
 * `SignalState` lifecycle in `@/domain/signals/signal`. After inspecting both
 * definitions, the decision is:
 *
 * **They are two genuinely different concepts and remain separate, with an
 * explicit typed bridge.**
 *
 * - `SignalState` (domain/signals/signal) is the LIFECYCLE of a concrete
 *   signal record: NONE → WATCH → CANDIDATE → CONFIRMED, then terminal
 *   INVALIDATED/EXPIRED. It answers "where is this specific signal in its
 *   life?".
 * - `SignalValidity` (domain/types, Part 1 §11) is the EVALUATION vocabulary
 *   used by display/explainability surfaces for a setup under evaluation —
 *   including intermediate evaluation states the lifecycle deliberately does
 *   not model (NO_SETUP = "engine found nothing", SETUP_FORMING, TRIGGERED,
 *   CLOSED). It answers "how does the engine currently judge this setup?".
 *
 * They are not interchangeable (a lifecycle is per-record; a validity is
 * per-evaluation), so neither is renamed, merged, or deleted. The bridge
 * below is TOTAL, EXPLICIT, and TEST-COVERED; every lifecycle state has
 * exactly one display mapping, and no unmapped combination can arise.
 *
 * Pure domain: no UI, no I/O.
 */
import { SIGNAL_STATES, type SignalState } from "@/domain/signals/signal";
import type { SignalValidity } from "@/domain/types";

/**
 * Total function: the display-validity vocabulary for a signal in a given
 * lifecycle state.
 *
 * Rationale per state:
 * - NONE: the engine evaluated and found nothing → display vocabulary NO_SETUP.
 * - WATCH: setup forming attention → WATCH.
 * - CANDIDATE: setup is forming → SETUP_FORMING.
 * - CONFIRMED: all rules passed → VALID.
 * - INVALIDATED: condition breached → INVALIDATED.
 * - EXPIRED: window elapsed → EXPIRED.
 * The lifecycle has no TRIGGERED/CLOSED states (those describe order/position
 * events owned by the trading layer, not the signal record) — the vocabulary
 * values remain valid for that future layer via SignalValidity itself.
 */
export function lifecycleToValidity(state: SignalState): SignalValidity {
  switch (state) {
    case "NONE":
      return "NO_SETUP";
    case "WATCH":
      return "WATCH";
    case "CANDIDATE":
      return "SETUP_FORMING";
    case "CONFIRMED":
      return "VALID";
    case "INVALIDATED":
      return "INVALIDATED";
    case "EXPIRED":
      return "EXPIRED";
  }
}

/** Compile-time exhaustiveness: every lifecycle state appears in the mapping. */
type Exhaustiveness = Exclude<SignalState, Parameters<typeof lifecycleToValidity>[0]> extends never
  ? true
  : never;
const _exhaustive: Exhaustiveness = true;
void _exhaustive;

/** The mapping is deterministic for the whole lifecycle — exported for tests/UI legend. */
export const LIFECYCLE_TO_VALIDITY: Readonly<Record<SignalState, SignalValidity>> = Object.fromEntries(
  SIGNAL_STATES.map((s) => [s, lifecycleToValidity(s)]),
) as Readonly<Record<SignalState, SignalValidity>>;
