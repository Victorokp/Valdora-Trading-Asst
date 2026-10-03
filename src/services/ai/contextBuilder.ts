/**
 * AI context builder (32V).
 *
 * Assembles the structured AIContext from service results — the only object
 * an AI layer may ever receive. Every element is tagged by its provenance
 * domain so downstream consumers can never confuse:
 *
 *   FACT      — measured/observed app data (snapshots, analyses)
 *   DERIVED   — computed by app engines from facts (rule traces, risk math)
 *   RESEARCH  — frozen, hash-pinned research evidence (cited, read-only)
 *   USER_DATA — the user's own journal/preferences (private)
 *   UNAVAILABLE — honestly-absent inputs (never padded, never guessed)
 *
 * No provider is contacted; no key exists; the builder only structures what
 * the services already returned. Uncertainty flags are MANDATORY whenever an
 * input is unavailable — an AI answer must carry the gaps, not paper over them.
 */
import type { AIContext, AIResponseMode, ContextUncertainty } from "@/domain/ai/context";
import type { MarketAnalysis } from "@/domain/analysis/analysis";
import type { MarketSnapshot } from "@/domain/market/snapshot";
import type { RiskState } from "@/domain/risk/risk";
import type { StrategyVersion } from "@/domain/strategy/strategy";
import type { ResearchRef } from "@/domain/research/evidence";
import type { ServiceResult } from "@/domain/errors";
import { isIntegrityFailure } from "@/domain/errors";

/** Provenance domain tags for context elements. */
export type ContextDomain = "FACT" | "DERIVED" | "RESEARCH" | "USER_DATA" | "UNAVAILABLE";

/** A provenance-tagged context element. */
export interface Tagged<T> {
  readonly domain: ContextDomain;
  readonly value: T | null;
  /** Why the element is UNAVAILABLE, when it is. */
  readonly unavailableReason?: string;
}

export function taggedFact<T>(value: T): Tagged<T> {
  return { domain: "FACT", value };
}
export function taggedDerived<T>(value: T): Tagged<T> {
  return { domain: "DERIVED", value };
}
export function taggedResearch<T>(value: T): Tagged<T> {
  return { domain: "RESEARCH", value };
}
export function taggedUserData<T>(value: T): Tagged<T> {
  return { domain: "USER_DATA", value };
}
export function taggedUnavailable<T>(reason: string): Tagged<T> {
  return { domain: "UNAVAILABLE", value: null, unavailableReason: reason };
}

/** Map a ServiceResult onto a Tagged element with honest uncertainty reasons. */
export function tagResult<T>(result: ServiceResult<T>, unavailableReason: string): Tagged<T> {
  if (result.status === "SUCCESS") return taggedFact(result.value);
  if (result.status === "NOT_CONFIGURED") return taggedUnavailable<T>("not configured yet");
  if (isIntegrityFailure(result)) return taggedUnavailable<T>("integrity check failed; input withheld");
  return taggedUnavailable<T>(unavailableReason);
}

/** Convert a tagged gap into the mandatory uncertainty flag. */
export function uncertaintyFrom<T>(taggedValue: Tagged<T>, kind: ContextUncertainty["kind"]): ContextUncertainty | null {
  if (taggedValue.domain !== "UNAVAILABLE") return null;
  return { kind, detail: taggedValue.unavailableReason ?? "input unavailable" };
}

/** Inputs the builder consumes — everything already fetched by the app. */
export interface AIContextInputs {
  readonly userQuestion: string;
  readonly responseMode?: AIResponseMode;
  readonly snapshots?: readonly ServiceResult<MarketSnapshot>[];
  readonly analyses?: readonly ServiceResult<MarketAnalysis>[];
  readonly riskState?: ServiceResult<RiskState>;
  readonly strategyVersion?: StrategyVersion;
  readonly researchRefs?: readonly ResearchRef[];
  readonly limitations?: readonly string[];
}

/** The assembled context plus its tagged audit trail. */
export interface AIContextBundle {
  readonly context: AIContext;
  readonly tagged: {
    readonly snapshots: readonly Tagged<MarketSnapshot>[];
    readonly analyses: readonly Tagged<MarketAnalysis>[];
    readonly risk: Tagged<RiskState>;
  };
}

export function buildAIContext(inputs: AIContextInputs): AIContextBundle {
  const uncertaintyFlags: ContextUncertainty[] = [];
  const limitations = [...(inputs.limitations ?? [])];

  const snapshotTags: readonly Tagged<MarketSnapshot>[] = (inputs.snapshots ?? []).map((r) => {
    const t = tagResult(r, "market snapshot unavailable");
    const u = uncertaintyFrom(t, "STALE_DATA");
    if (u) uncertaintyFlags.push(u);
    return t;
  });

  const analysisTags = (inputs.analyses ?? []).map((r): Tagged<MarketAnalysis> => {
    const t: Tagged<MarketAnalysis> =
      r.status === "SUCCESS" ? taggedDerived(r.value) : tagResult<MarketAnalysis>(r, "market analysis unavailable");
    const u = uncertaintyFrom(t, "MISSING_DATA");
    if (u) uncertaintyFlags.push(u);
    return t;
  });

  const riskTag: Tagged<RiskState> = inputs.riskState === undefined
    ? taggedUnavailable<RiskState>("risk state not evaluated")
    : tagResult(inputs.riskState, "risk state unavailable");
  const riskUncertainty = uncertaintyFrom(riskTag, "MISSING_DATA");
  if (riskUncertainty) uncertaintyFlags.push(riskUncertainty);

  // Research references are RESEARCH-domain by construction; pending research
  // is always flagged so the answer can carry the PENDING state honestly.
  const refs = inputs.researchRefs ?? [];
  if (refs.length === 0) {
    uncertaintyFlags.push({ kind: "LIMITED_EVIDENCE", detail: "no research references supplied for this question" });
  }

  return {
    context: {
      userQuestion: inputs.userQuestion,
      marketContext: {
        snapshots: snapshotTags.flatMap((t) => (t.value !== null ? [t.value] : [])),
        analyses: analysisTags.flatMap((t) => (t.value !== null ? [t.value] : [])),
      },
      researchReferences: refs,
      strategyContext: inputs.strategyVersion
        ? { strategyVersion: inputs.strategyVersion, note: "Frozen configuration data — the AI never modifies strategy parameters." }
        : undefined,
      riskContext: riskTag.value ?? undefined,
      uncertaintyFlags,
      limitations,
      responseMode: inputs.responseMode ?? "EXPLAIN",
    },
    tagged: {
      snapshots: snapshotTags,
      analyses: analysisTags,
      risk: riskTag,
    },
  };
}
