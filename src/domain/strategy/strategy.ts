/**
 * Strategy + strategy version domain (32D).
 *
 * A strategy is the logical entity; a StrategyVersion is the immutable,
 * provenance-carrying snapshot that stamps every signal, trade and analysis.
 * Old versions are never silently replaced — a change creates a new version.
 *
 * Pure domain: no strategy logic, no calculation, no research execution.
 */
import type { StrategyId, StrategyVersionId } from "@/domain/ids";
import type { ResearchRef } from "@/domain/research/evidence";

/** Lifecycle of a strategy as a product entity. */
export const STRATEGY_STATUSES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];

/** The strategy entity: identity + current version pointer only. */
export interface Strategy {
  readonly id: StrategyId;
  readonly name: string;
  readonly description: string;
  readonly status: StrategyStatus;
  /** ISO-8601 creation date of the strategy entity. */
  readonly createdAt: string;
  /** The version currently active for new work. */
  readonly currentVersionId: StrategyVersionId;
}

/**
 * An immutable strategy-version snapshot. Carries the parameter metadata and
 * the research provenance that justifies its use. The frozen flag marks
 * versions whose parameters must never change (the historical lineage).
 */
export interface StrategyVersion {
  readonly strategyId: StrategyId;
  readonly versionId: StrategyVersionId;
  /** Human-facing label, e.g. "Golden Reference v1". */
  readonly versionLabel: string;
  /** ISO-8601 date from which this version is effective. */
  readonly effectiveDate: string;
  /** Reference to the methodology the version implements. */
  readonly methodologyRef: string;
  /**
   * Parameter metadata as declared configuration data (e.g. EMA spans, ATR
   * periods, stop/target multiples). Deliberately a record, not executable logic.
   */
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  /** Research/evidence lineage supporting this version. */
  readonly researchProvenance: readonly ResearchRef[];
  /** Frozen versions can never be modified — a change means a new version. */
  readonly frozen: boolean;
  readonly note?: string;
}

/** Creates a version; frozen versions must carry research provenance by construction. */
export function createStrategyVersion(version: StrategyVersion): StrategyVersion {
  if (version.frozen && version.researchProvenance.length === 0) {
    throw new Error("a frozen strategy version must cite research provenance");
  }
  return version;
}
