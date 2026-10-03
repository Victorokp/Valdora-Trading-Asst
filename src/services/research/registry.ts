/**
 * Research registry (32G).
 *
 * A CURATED, hand-authored registry of research-phase metadata. Every state,
 * metric and reference here is copied from frozen documents/artifacts and
 * pinned to the commit that introduced them — nothing is inferred from
 * filenames or paths at runtime, and the UI cannot invent conclusions because
 * it only ever receives these structures through the ResearchService.
 *
 * Evidence states and limitation texts mirror the frozen evidence verbatim
 * (architecture Part 2 §2/§4; completeness audit §2). When the research
 * checkpoint advances, this registry is updated deliberately — as a reviewed
 * change — never dynamically.
 */
import type { ResearchRef } from "@/domain/research/evidence";
import type { ResearchPhaseSummary } from "@/domain/research/evidence";
import type { ResearchMetric, ResearchPhaseDescription } from "@/services/index";
import { PHASE30_CURRENT_READINESS } from "@/domain/research/phase30";

const DATASET_HASH = "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52";

/** Commit SHAs from the research checkpoint chain (re-verified at each integrity gate). */
export const RESEARCH_COMMITS = {
  phase21GR: "438e35e",
  phase28: "a7279f9",
  phase29: "a3dc35e",
  phase30Preregistration: "3831031",
  phase30Resolution: "9fb845d",
  phase31Original: "76e9c3e",
  phase31B1Correction: "03f9561",
  phase31Closure: "b1c6d95",
} as const;

export interface RegistryPhase {
  readonly summary: ResearchPhaseSummary;
  readonly description: ResearchPhaseDescription;
  readonly refs: readonly ResearchRef[];
  readonly metrics: readonly ResearchMetric[];
}

export const RESEARCH_REGISTRY: Readonly<Record<string, RegistryPhase>> = {
  phase21: {
    summary: {
      id: "phase21",
      title: "Phase 21 — Reconstruction & ledger",
      status: "CLOSED",
      evidenceState: "SUPPORTED",
      summary:
        "Golden Reference reconstruction: 115 historical trades, +32.2644R, PF 1.4889, maxDD −12R on the frozen EURUSD dataset.",
      limitations: [
        "Historical sample only; forward validation outstanding.",
        "Execution timing is materially sensitive (quantified in Phase 29).",
      ],
    },
    description: {
      phaseId: "phase21",
      purpose:
        "Reconstruct the historical EURUSD benchmark exactly, from the Golden Reference and the frozen dataset, with a fully hash-verified trade ledger.",
      methodology:
        "Frozen weekly-regime + daily-pullback strategy, next-bar-open entries, 1×ATR stop / 2×ATR target, stop-first gap precedence; ledger gates re-run every phase.",
      data: "Primary EURUSD daily dataset (frozen; SHA-256 prefix e0676d92…d52), 1971-01-04 → 2026-09-25; strategy window from 2003-12-01 with 60-bar warm-up.",
      results:
        "115 resolved trades · +32.2644R total · PF 1.4889 · win rate 47.83% · maxDD −12.00R · longest losing streak 7 (frozen ledger).",
      limitations: [
        "Historical sample only.",
        "The benchmark is one strategy on one pair; transfer is examined separately (D1).",
        "Execution timing is materially sensitive.",
      ],
      refs: [
        {
          phase: "PHASE21",
          artifact: "Golden Reference executable specification (frozen .py)",
          evidenceState: "SUPPORTED",
          commit: RESEARCH_COMMITS.phase21GR,
          datasetHash: DATASET_HASH,
        },
        {
          phase: "PHASE21",
          artifact: "Phase-21 trade ledger (frozen .csv)",
          evidenceState: "SUPPORTED",
          commit: RESEARCH_COMMITS.phase21GR,
          datasetHash: DATASET_HASH,
        },
      ],
    },
    refs: [],
    metrics: [
      { label: "Total trades", value: "115", ref: { phase: "PHASE21", artifact: "Phase-21 trade ledger (frozen .csv)", evidenceState: "SUPPORTED", commit: RESEARCH_COMMITS.phase21GR } },
      { label: "Total R", value: "+32.2644R", ref: { phase: "PHASE21", artifact: "Phase-21 trade ledger (frozen .csv)", evidenceState: "SUPPORTED", commit: RESEARCH_COMMITS.phase21GR } },
      { label: "Profit factor", value: "1.4889", ref: { phase: "PHASE21", artifact: "Phase-21 trade ledger (frozen .csv)", evidenceState: "SUPPORTED", commit: RESEARCH_COMMITS.phase21GR } },
      { label: "Max drawdown", value: "−12.00R", ref: { phase: "PHASE21", artifact: "Phase-21 trade ledger (frozen .csv)", evidenceState: "SUPPORTED", commit: RESEARCH_COMMITS.phase21GR } },
    ],
  },

  phase27: {
    summary: {
      id: "phase27",
      title: "Phase 27 — Enriched diagnostics",
      status: "CLOSED",
      evidenceState: "LIMITED",
      summary:
        "Trade-level diagnostics (ATR percentiles, EMA gaps, weekly conditions) and weak-transfer priors for later phases.",
      limitations: ["Diagnostic scope; no standalone profitability claim."],
    },
    description: {
      phaseId: "phase27",
      purpose: "Enrich the frozen ledger with per-trade diagnostics to inform later robustness and transfer analysis.",
      methodology: "Deterministic column enrichment of the frozen ledger; no strategy change, no re-fitting.",
      data: "Frozen Phase-21 ledger + derived per-trade features.",
      results: "Diagnostics only; recorded priors used by Phases 28–29.",
      limitations: ["Diagnostic scope; descriptive statistics, not predictions."],
      refs: [],
    },
    refs: [],
    metrics: [],
  },

  phase28: {
    summary: {
      id: "phase28",
      title: "Phase 28 — Strict OOS / walk-forward",
      status: "CLOSED",
      evidenceState: "MIXED",
      summary:
        "Out-of-sample 2010–2025: 76 trades, +32.26R, PF 1.81 — with honest structural caveats (median trade −1R; small yearly samples).",
      limitations: [
        "Median trade is a full stop-out; the edge is carried by ≈47% of trades reaching ≈ +2R.",
        "Most test years traded fewer than 10 trades; two years had zero signals.",
        "Bootstrap/Monte Carlo envelopes quantify sensitivity — they are not prediction intervals.",
      ],
    },
    description: {
      phaseId: "phase28",
      purpose: "Assess out-of-sample behavior with strict walk-forward bucketing (no retraining, no parameter change).",
      methodology: "16 complete windows (test years 2010–2025) + partial 2026 reported separately; bootstrap (10,000 resamples) and Monte Carlo order tests (10,000 permutations), all seeded and frozen.",
      data: "Frozen Phase-21 ledger; entry-year bucketing (train [Y, Y+4], val Y+5, test Y+6).",
      results:
        "OOS 76 trades · +32.26R · PF 1.81 · win rate 47.37% · maxDD −12R · streak 7; bootstrap total-R band [+8.00, +56.60]R; 0.79% of resamples negative.",
      limitations: [
        "Descriptive, not predictive: envelopes quantify sensitivity of the observed result, they do not forecast.",
        "Median trade −1.00R; 14 of 16 test years traded, most with < 10 trades.",
      ],
      refs: [
        {
          phase: "PHASE28",
          artifact: "PHASE28_STATISTICS.md",
          evidenceState: "MIXED",
          commit: RESEARCH_COMMITS.phase28,
        },
      ],
    },
    refs: [],
    metrics: [
      { label: "OOS trades", value: "76", ref: { phase: "PHASE28", artifact: "PHASE28_STATISTICS.md", evidenceState: "MIXED", commit: RESEARCH_COMMITS.phase28 } },
      { label: "OOS total R", value: "+32.26R", ref: { phase: "PHASE28", artifact: "PHASE28_STATISTICS.md", evidenceState: "MIXED", commit: RESEARCH_COMMITS.phase28 } },
      { label: "OOS profit factor", value: "1.8064", ref: { phase: "PHASE28", artifact: "PHASE28_STATISTICS.md", evidenceState: "MIXED", commit: RESEARCH_COMMITS.phase28 } },
    ],
  },

  phase29: {
    summary: {
      id: "phase29",
      title: "Phase 29 — Robustness & stress testing",
      status: "CLOSED",
      evidenceState: "MIXED",
      summary:
        "Control result is fragile to execution delay: +1 bar ≈ +20.04R, +2 bars ≈ +2.00R vs control +32.2644R. Friction sensitivity quantified 0–6 pips.",
      limitations: [
        "Execution timing materially degrades the historical result — a standing limitation of every downstream claim.",
        "Historical, single-pair stress tests; not a forecast.",
      ],
    },
    description: {
      phaseId: "phase29",
      purpose: "Stress the historical result across execution delay, friction, regime and temporal windows.",
      methodology: "Deterministic GR-invocation harness (per-pair PIP override, warm-up preserved); fixed grids; frozen artifacts + hash gates.",
      data: "Frozen dataset and ledger; Phase-29 stress harness.",
      results:
        "Control +32.2644R · +1 bar ≈ +20.04R · +2 bars ≈ +2.00R; friction grid 0–6 pips; temporal/regime/drawdown stress artifacts frozen.",
      limitations: [
        "Execution-delay fragility is a standing limitation for all downstream phases.",
        "Stress results are historical measurements, not guarantees of any kind.",
      ],
      refs: [
        {
          phase: "PHASE29",
          artifact: "phase29_summary.json",
          evidenceState: "MIXED",
          commit: RESEARCH_COMMITS.phase29,
        },
      ],
    },
    refs: [],
    metrics: [
      { label: "Control total R", value: "+32.2644R", ref: { phase: "PHASE29", artifact: "phase29_summary.json", evidenceState: "MIXED", commit: RESEARCH_COMMITS.phase29 } },
      { label: "Total R at +1 bar delay", value: "≈ +20.04R", ref: { phase: "PHASE29", artifact: "phase29_summary.json", evidenceState: "MIXED", commit: RESEARCH_COMMITS.phase29 } },
      { label: "Total R at +2 bars delay", value: "≈ +2.00R", ref: { phase: "PHASE29", artifact: "phase29_summary.json", evidenceState: "MIXED", commit: RESEARCH_COMMITS.phase29 } },
    ],
  },

  phase30: {
    summary: {
      id: "phase30",
      title: "Phase 30 — Forward validation",
      status: "PREREGISTERED",
      evidenceState: "PENDING",
      summary:
        "Preregistered and waiting for A1 eligibility (≥60 qualifying EURUSD trading days strictly after 2026-09-25). No execution, no fabrication.",
      limitations: [
        "No forward result exists yet; the app never substitutes data, backdates, or manufactures qualifying days.",
        "D1 external pairs (NZDUSD, USDCHF, USDCAD) are not acquired; their degraded path is pre-registered.",
      ],
    },
    description: {
      phaseId: "phase30",
      purpose: "Forward-validate the frozen strategy on strictly-future EURUSD daily data under the preregistered protocol.",
      methodology:
        "Eight preregistered families (A1, A2, B1, B2, B3, C1, D1, E1) with fixed parameters, pre-declared metrics and quality gates; G1–G4 protocol clarifications resolved in the 32E-batch research checkpoint (9fb845d).",
      data:
        "A1 requires future daily EURUSD OHLC strictly after 2026-09-25 (≥60 qualifying days). D1 uses three repository pairs (GBPUSD, USDJPY, AUDUSD) and three externally-acquired pairs (NZDUSD, USDCHF, USDCAD) — not yet acquired.",
      results:
        "None yet — preregistered. The official research artifact will remain authoritative; the UI only mirrors it.",
      limitations: [
        "A1 is PENDING / NOT YET ELIGIBLE.",
        "The app must never execute early, substitute data, or fabricate progress.",
      ],
      refs: [
        {
          phase: "PHASE30",
          artifact: "PHASE30_EXPERIMENT_REGISTRY.md",
          evidenceState: "PENDING",
          commit: RESEARCH_COMMITS.phase30Preregistration,
        },
        {
          phase: "PHASE30",
          artifact: "PHASE30_SPECIFICATION.md (G1–G4 clarifications)",
          evidenceState: "PENDING",
          commit: RESEARCH_COMMITS.phase30Resolution,
        },
      ],
    },
    refs: [],
    metrics: [],
  },

  phase31: {
    summary: {
      id: "phase31",
      title: "Phase 31 — Statistical evidence audit",
      status: "CLOSED",
      evidenceState: "MIXED",
      summary:
        "Corrected B1: observed +32.2644R at the 97.73rd percentile of the dependence-aware null — 2.27% descriptive reference, explicitly NOT a definitive strategy p-value.",
      limitations: [
        "Historical sample only; forward validation outstanding.",
        "The corrected B1 result is a descriptive reference, not a definitive p-value (preregistered guard).",
        "Execution timing is materially sensitive.",
        "Statistical reference tests do not prove future profitability.",
      ],
    },
    description: {
      phaseId: "phase31",
      purpose: "Assess the statistical evidence surrounding the historical +32.26R result.",
      methodology:
        "Dependence-aware block resampling (A1), trade-sign permutation with shuffle (B1 corrected), concentration (C1), cluster structure (C2), drawdown structure (C3), research inventory (D1), selection assessment (D2), evidence synthesis (E1).",
      data: "Frozen Phase-21 ledger (115 trades); seeds and permutation counts frozen in artifacts.",
      results:
        "Corrected B1: null total-R percentiles −38.0864 / −26.2461 / −10.2461 / +0.0864 / +11.7356 / +26.2644 / +37.9319R; observed +32.2644R at the 97.73rd percentile; P(null ≥ observed) = 2.27% (descriptive reference). Corrected maxDD null p50 −17R with observed −12R at the 80.14th percentile; streak reference 6/10.",
      limitations: [
        "NOT a definitive strategy p-value (preregistered guard).",
        "Original execution preserved; corrected B1 replaces only the invalid order-dependent interpretation.",
        "Statistical reference tests do not prove future profitability.",
      ],
      refs: [
        {
          phase: "PHASE31",
          family: "B1",
          artifact: "B1_summary_CORRECTED.json",
          evidenceState: "MIXED",
          commit: RESEARCH_COMMITS.phase31B1Correction,
          artifactHash: "7f0d215e2026b8576efd54e228b748820b251f16bc4670ce4745c4c7791217cc",
          datasetHash: DATASET_HASH,
        },
        {
          phase: "PHASE31",
          artifact: "E1_evidence_matrix.md",
          evidenceState: "MIXED",
          commit: RESEARCH_COMMITS.phase31Closure,
        },
      ],
    },
    refs: [],
    metrics: [
      {
        label: "Observed total R (percentile of null)",
        value: "+32.2644R @ 97.73rd",
        ref: {
          phase: "PHASE31",
          family: "B1",
          artifact: "B1_summary_CORRECTED.json",
          evidenceState: "MIXED",
          commit: RESEARCH_COMMITS.phase31B1Correction,
          artifactHash: "7f0d215e2026b8576efd54e228b748820b251f16bc4670ce4745c4c7791217cc",
          limitation: "Descriptive reference — not a definitive strategy p-value.",
        },
      },
      {
        label: "P(null ≥ observed) — descriptive",
        value: "2.27%",
        ref: {
          phase: "PHASE31",
          family: "B1",
          artifact: "B1_summary_CORRECTED.json",
          evidenceState: "MIXED",
          commit: RESEARCH_COMMITS.phase31B1Correction,
          artifactHash: "7f0d215e2026b8576efd54e228b748820b251f16bc4670ce4745c4c7791217cc",
          limitation: "Descriptive reference — not a definitive strategy p-value.",
        },
      },
      {
        label: "Observed maxDD (percentile of null)",
        value: "−12R @ 80.14th (null p50 −17R)",
        ref: {
          phase: "PHASE31",
          family: "B1",
          artifact: "B1_summary_CORRECTED.json",
          evidenceState: "MIXED",
          commit: RESEARCH_COMMITS.phase31B1Correction,
          artifactHash: "7f0d215e2026b8576efd54e228b748820b251f16bc4670ce4745c4c7791217cc",
          limitation: "Descriptive reference — not a definitive strategy p-value.",
        },
      },
    ],
  },
};

/** Registry order for display (Part 2 §2). Phase 26/27-adjacent phases omitted deliberately. */
export const REGISTRY_PHASE_ORDER: readonly string[] = [
  "phase21",
  "phase27",
  "phase28",
  "phase29",
  "phase30",
  "phase31",
];

/** The Phase-30 readiness mirror — read from the domain constant, never re-derived. */
export function phase30ReadinessFromRegistry() {
  return PHASE30_CURRENT_READINESS;
}
