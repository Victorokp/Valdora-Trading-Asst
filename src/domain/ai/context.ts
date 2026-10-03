/**
 * AI context contract (32D).
 *
 * The structured context that may later be passed to Valdora's AI layer.
 * CRITICAL DESIGN RULE: the AI can only ever *receive* references — it
 * structurally cannot *supply* market prices, research conclusions, risk
 * values or strategy parameters, because those appear in the context as
 * provenance-stamped citations, and the response contract marks every AI
 * output as non-authoritative explanation.
 *
 * Pure domain: no provider, no keys, no network.
 */
import type { ResearchRef } from "@/domain/research/evidence";
import type { MarketSnapshot } from "@/domain/market/snapshot";
import type { MarketAnalysis } from "@/domain/analysis/analysis";
import type { RiskState } from "@/domain/risk/risk";
import type { StrategyVersion } from "@/domain/strategy/strategy";

/** Response modes the user/product may request. */
export const AI_RESPONSE_MODES = ["EXPLAIN", "SUMMARIZE", "EDUCATE"] as const;
export type AIResponseMode = (typeof AI_RESPONSE_MODES)[number];

/** How confident the requesting layer is about a piece of context. */
export type ContextUncertainty =
  | { readonly kind: "STALE_DATA"; readonly detail: string }
  | { readonly kind: "MISSING_DATA"; readonly detail: string }
  | { readonly kind: "PENDING_RESEARCH"; readonly detail: string }
  | { readonly kind: "LIMITED_EVIDENCE"; readonly detail: string };

/**
 * The full AI request context. Every domain value enters as structured,
 * provenance-carrying data — the AI layer reads, never writes.
 */
export interface AIContext {
  /** The user's question, verbatim. */
  readonly userQuestion: string;
  /** Relevant market state, as observed (may be empty/stale — flagged, never padded). */
  readonly marketContext?: {
    readonly snapshots: readonly MarketSnapshot[];
    readonly analyses: readonly MarketAnalysis[];
  };
  /** Research references the answer must cite verbatim (evidence states included). */
  readonly researchReferences: readonly ResearchRef[];
  /** Strategy/version context, when relevant. */
  readonly strategyContext?: {
    readonly strategyVersion: StrategyVersion;
    readonly note?: string;
  };
  /** Risk context the answer must respect. */
  readonly riskContext?: RiskState;
  /** Explicit uncertainty flags — mandatory when data is incomplete. */
  readonly uncertaintyFlags: readonly ContextUncertainty[];
  /** Limitations the answer must carry (e.g. Phase-29 timing sensitivity). */
  readonly limitations: readonly string[];
  /** Requested response mode. */
  readonly responseMode: AIResponseMode;
}

/**
 * Structured response metadata. `explanation` is presentation material —
 * it is never a price, a research result, a risk value or a parameter.
 */
export interface AIResponse {
  readonly explanation: string;
  /** Citations the response used (must be a subset of the context's references). */
  readonly citedRefs: readonly ResearchRef[];
  /** Uncertainty flags the response acknowledged. */
  readonly acknowledgedUncertainty: readonly ContextUncertainty["kind"][];
  /** Which mode produced the response. */
  readonly responseMode: AIResponseMode;
  /** Provider label for display; the provider is never the source of truth. */
  readonly providerLabel?: string;
}
