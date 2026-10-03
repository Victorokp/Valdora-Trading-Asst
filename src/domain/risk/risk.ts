/**
 * Risk domain (32D).
 *
 * Domain types for risk information and guardrail status. Neutral states
 * only (NORMAL/WARNING/BLOCKED/UNKNOWN). No broker, no account integration,
 * no live position sizing: sizing needs actual market + account inputs and
 * is computed by the (future) risk engine, never invented here.
 *
 * Pure domain: no I/O.
 */

/** Neutral risk status. */
export const RISK_STATUSES = ["NORMAL", "WARNING", "BLOCKED", "UNKNOWN"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

/** Alias required by the architecture: guardrails use the same neutral vocabulary. */
export type GuardrailStatus = RiskStatus;

/** Configurable guardrail limits (Settings → Risk). Values live with the user. */
export interface RiskGuardrails {
  /** Maximum risk per trade as a fraction of account (0.01 = 1%). */
  readonly maxRiskPerTrade?: number;
  /** Maximum daily loss in R (negative number, e.g. -3). */
  readonly maxDailyLossR?: number;
  /** Maximum open exposure in R. */
  readonly maxOpenExposureR?: number;
  /** Maximum concurrent open trades. */
  readonly maxConcurrentTrades?: number;
  /** Drawdown alert threshold in R (negative number). */
  readonly maxDrawdownAlertR?: number;
}

/** A guardrail evaluation outcome — one limit, one status, one explanation. */
export interface GuardrailCheck {
  readonly limit: keyof RiskGuardrails;
  readonly status: GuardrailStatus;
  /** Factual explanation, e.g. "1 open trade of max 3". */
  readonly message: string;
}

/** Current aggregate risk state of the user's trading (as reported/measured). */
export interface RiskState {
  /** Guardrail evaluation for each configured limit. */
  readonly guardrails: readonly GuardrailCheck[];
  /** Aggregate guardrail status: worst of the individual checks. */
  readonly guardrailStatus: GuardrailStatus;
  /** Overall risk status derived by the caller (worst-of policy is application logic). */
  readonly status: RiskStatus;
  /** Provenance of the inputs (e.g. user-reported account state). */
  readonly assessedAt?: string;
}

/** Summary of currently open exposure, as entered/reported (never fabricated). */
export interface ExposureSummary {
  /** Number of open trades the user reports. */
  readonly openTrades?: number;
  /** Sum of open risk in R. */
  readonly openExposureR?: number;
  readonly status: RiskStatus;
}

/** Drawdown summary measured from a closed-R path (user journal or declared data). */
export interface DrawdownSummary {
  /** Most negative cumulative-R drawdown, negative sign (research convention). */
  readonly maxDrawdownR?: number;
  /** Current drawdown from equity peak, when computable. */
  readonly currentDrawdownR?: number;
  readonly status: RiskStatus;
}
