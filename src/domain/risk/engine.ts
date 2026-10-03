/**
 * Risk engine (32K) — deterministic risk arithmetic and guardrails.
 *
 * Computes stop/target distances in pips, R:R, risk amounts and percentages
 * from EXPLICITLY SUPPLIED inputs. There is no default account size, no
 * inferred balance and no silent substitution: an input that is absent
 * produces an UNAVAILABLE outcome, never a guessed number.
 *
 * Guardrail outcomes use the existing four-state risk vocabulary
 * (NORMAL/WARNING/BLOCKED/UNKNOWN) from @/domain/risk/risk — no new states.
 *
 * Pure domain: no broker, no account access, no I/O.
 */
import { RISK_STATUSES, type GuardrailCheck, type GuardrailStatus, type RiskGuardrails, type RiskStatus } from "@/domain/risk/risk";

/** One leg (entry/stop/target) of a risk computation. */
export interface RiskLevel {
  readonly label: "ENTRY" | "STOP" | "TARGET";
  readonly price: number | undefined;
}

/** Deterministic pip-distance computation result. */
export interface PipDistance {
  readonly pips: number;
  readonly priceUnits: number;
}

/** Full risk evaluation of one planned trade's geometry. */
export interface TradeRiskEvaluation {
  readonly entry: RiskLevel;
  readonly stop: RiskLevel;
  readonly target: RiskLevel;
  /** Stop distance in pips (positive), when both levels are known. */
  readonly stopDistancePips?: number;
  /** Target distance in pips (positive), when both levels are known. */
  readonly targetDistancePips?: number;
  /** Reward:risk ratio (target/stop distance), when both distances are known. */
  readonly rewardRisk?: number;
  /** Direction sanity: stop on the loss side, target on the profit side. */
  readonly geometryValid?: boolean;
  /** Factual explanations for any UNAVAILABLE/BLOCKED outcome. */
  readonly problems: readonly string[];
}

/**
 * Evaluate trade geometry. All inputs explicit; nothing inferred. For a LONG
 * the stop must be below entry and the target above (mirrored for SHORT).
 */
export function evaluateTradeGeometry(input: {
  direction: "LONG" | "SHORT";
  entry?: number;
  stop?: number;
  target?: number;
  pipSize?: number;
}): TradeRiskEvaluation {
  const { direction, entry, stop, target, pipSize } = input;
  const problems: string[] = [];
  const result: TradeRiskEvaluation = {
    entry: { label: "ENTRY", price: entry },
    stop: { label: "STOP", price: stop },
    target: { label: "TARGET", price: target },
    problems,
  };
  if (entry === undefined) problems.push("entry price not supplied");
  if (stop === undefined) problems.push("stop price not supplied");
  if (target === undefined) problems.push("target price not supplied");
  if (pipSize === undefined || pipSize <= 0) problems.push("pip size not declared for instrument");
  if (entry === undefined || stop === undefined || target === undefined || pipSize === undefined || pipSize <= 0) {
    return result;
  }
  const stopUnits = direction === "LONG" ? entry - stop : stop - entry;
  const targetUnits = direction === "LONG" ? target - entry : entry - target;
  const stopPips = stopUnits / pipSize;
  const targetPips = targetUnits / pipSize;
  const geometryValid = stopUnits > 0 && targetUnits > 0;
  if (!geometryValid) {
    problems.push(
      direction === "LONG"
        ? "stop must be below entry and target above entry for a long"
        : "stop must be above entry and target below entry for a short",
    );
  }
  return {
    ...result,
    stopDistancePips: Math.abs(stopPips),
    targetDistancePips: Math.abs(targetPips),
    rewardRisk: stopUnits !== 0 ? Math.abs(targetUnits / stopUnits) : undefined,
    geometryValid,
    problems,
  };
}

/** Position-size result: every unknown stays unknown. */
export interface PositionSizing {
  /** Risk amount in account currency; requires account equity + risk %/amount. */
  readonly riskAmount?: number;
  /** Risk as a fraction of account equity, when both inputs exist. */
  readonly riskFraction?: number;
  /** Position size in units of the base currency, when computable. */
  readonly positionUnits?: number;
  readonly status: RiskStatus;
  /** Why sizing is not computable, when it is not. */
  readonly reason?: string;
}

/**
 * Compute position sizing from explicit inputs only. Never assumes an
 * account size: missing equity or missing risk configuration yields an
 * UNKNOWN status with an explanation, never a default.
 */
export function computePositionSizing(input: {
  stopDistancePips?: number;
  pipSize?: number;
  /** Value of one pip per standard lot (quote-currency units), when supplied by the caller. */
  pipValuePerLot?: number;
  accountEquity?: number;
  /** Fraction of equity to risk (0.01 = 1%), when configured. */
  riskFraction?: number;
  /** Absolute risk amount, when configured directly. */
  riskAmount?: number;
}): PositionSizing {
  const { stopDistancePips, pipSize, pipValuePerLot, accountEquity, riskFraction, riskAmount } = input;
  if (stopDistancePips === undefined || pipSize === undefined || stopDistancePips <= 0) {
    return { status: "UNKNOWN", reason: "stop distance is not determinable yet" };
  }
  if (pipValuePerLot === undefined || pipValuePerLot <= 0) {
    return { status: "UNKNOWN", reason: "pip value per lot has not been supplied" };
  }
  const riskAmt =
    riskAmount !== undefined
      ? riskAmount
      : accountEquity !== undefined && riskFraction !== undefined
        ? accountEquity * riskFraction
        : undefined;
  if (riskAmt === undefined) {
    return { status: "UNKNOWN", reason: "no account equity and risk configuration supplied (no defaults assumed)" };
  }
  if (riskAmt <= 0) {
    return { status: "UNKNOWN", reason: "risk amount must be positive" };
  }
  const riskPerLot = stopDistancePips * pipValuePerLot;
  if (riskPerLot <= 0) return { status: "UNKNOWN", reason: "risk per lot is not positive" };
  return {
    riskAmount: riskAmt,
    riskFraction: accountEquity !== undefined ? riskAmt / accountEquity : riskFraction,
    positionUnits: (riskAmt / riskPerLot) * 100_000,
    status: "NORMAL",
  };
}

/** Worst-of aggregation over the neutral statuses (BLOCKED > WARNING > UNKNOWN > NORMAL). */
export function worstStatus(statuses: readonly RiskStatus[]): RiskStatus {
  const rank: Record<RiskStatus, number> = { BLOCKED: 3, WARNING: 2, UNKNOWN: 1, NORMAL: 0 };
  return statuses.reduce<RiskStatus>((worst, s) => (rank[s] > rank[worst] ? s : worst), "NORMAL");
}

/** Inputs for guardrail evaluation: everything measured so far, honestly. */
export interface GuardrailInputs {
  readonly guardrails: RiskGuardrails;
  /** Risk fraction of the trade currently being evaluated (when any). */
  readonly candidateRiskFraction?: number;
  /** Open exposure in R the user currently reports. */
  readonly openExposureR?: number;
  /** Open trade count the user currently reports. */
  readonly openTrades?: number;
  /** Current drawdown in R (negative), when computable from the journal. */
  readonly currentDrawdownR?: number;
}

/**
 * Evaluate every configured guardrail. Unconfigured limits are reported as
 * UNKNOWN with an explanation (never skipped silently); a breached limit is
 * BLOCKED with a factual message.
 */
export function evaluateGuardrails(inputs: GuardrailInputs): readonly GuardrailCheck[] {
  const checks: GuardrailCheck[] = [];
  const { guardrails } = inputs;

  if (guardrails.maxRiskPerTrade !== undefined) {
    const candidate = inputs.candidateRiskFraction;
    checks.push(
      candidate === undefined
        ? { limit: "maxRiskPerTrade", status: "UNKNOWN", message: "no candidate trade risk supplied to compare" }
        : candidate > guardrails.maxRiskPerTrade
          ? {
              limit: "maxRiskPerTrade",
              status: "BLOCKED",
              message: `candidate risk ${(candidate * 100).toFixed(2)}% exceeds the ${(guardrails.maxRiskPerTrade * 100).toFixed(2)}% limit`,
            }
          : {
              limit: "maxRiskPerTrade",
              status: "NORMAL",
              message: `candidate risk ${(candidate * 100).toFixed(2)}% within the ${(guardrails.maxRiskPerTrade * 100).toFixed(2)}% limit`,
            },
    );
  }
  if (guardrails.maxOpenExposureR !== undefined) {
    const open = inputs.openExposureR;
    checks.push(
      open === undefined
        ? { limit: "maxOpenExposureR", status: "UNKNOWN", message: "open exposure not reported yet" }
        : open > guardrails.maxOpenExposureR
          ? { limit: "maxOpenExposureR", status: "BLOCKED", message: `open exposure ${open}R exceeds the ${guardrails.maxOpenExposureR}R limit` }
          : { limit: "maxOpenExposureR", status: "NORMAL", message: `open exposure ${open}R of ${guardrails.maxOpenExposureR}R` },
    );
  }
  if (guardrails.maxConcurrentTrades !== undefined) {
    const open = inputs.openTrades;
    checks.push(
      open === undefined
        ? { limit: "maxConcurrentTrades", status: "UNKNOWN", message: "open trade count not reported yet" }
        : open > guardrails.maxConcurrentTrades
          ? { limit: "maxConcurrentTrades", status: "BLOCKED", message: `${open} open trades exceeds the maximum of ${guardrails.maxConcurrentTrades}` }
          : { limit: "maxConcurrentTrades", status: "NORMAL", message: `${open} open trade${open === 1 ? "" : "s"} of max ${guardrails.maxConcurrentTrades}` },
    );
  }
  if (guardrails.maxDailyLossR !== undefined) {
    const dd = inputs.currentDrawdownR;
    checks.push(
      dd === undefined
        ? { limit: "maxDailyLossR", status: "UNKNOWN", message: "current drawdown not yet computable from your journal" }
        : dd <= guardrails.maxDailyLossR
          ? { limit: "maxDailyLossR", status: "BLOCKED", message: `drawdown ${dd}R breaches the ${guardrails.maxDailyLossR}R daily-loss limit` }
          : { limit: "maxDailyLossR", status: "NORMAL", message: `drawdown ${dd}R within the ${guardrails.maxDailyLossR}R limit` },
    );
  }
  if (guardrails.maxDrawdownAlertR !== undefined) {
    const dd = inputs.currentDrawdownR;
    checks.push(
      dd === undefined
        ? { limit: "maxDrawdownAlertR", status: "UNKNOWN", message: "current drawdown not yet computable from your journal" }
        : dd <= guardrails.maxDrawdownAlertR
          ? { limit: "maxDrawdownAlertR", status: "WARNING", message: `drawdown ${dd}R past the ${guardrails.maxDrawdownAlertR}R alert threshold` }
          : { limit: "maxDrawdownAlertR", status: "NORMAL", message: `drawdown ${dd}R better than the ${guardrails.maxDrawdownAlertR}R alert threshold` },
    );
  }
  if (checks.length === 0) {
    checks.push({ limit: "maxRiskPerTrade", status: "UNKNOWN", message: "no guardrails are configured yet (Settings → Risk)" });
  }
  return checks;
}

/** Minimum R:R guardrail outcome for a candidate trade. */
export function checkMinimumRewardRisk(rewardRisk: number | undefined, minimum?: number): GuardrailCheck {
  if (minimum === undefined) {
    return { limit: "maxRiskPerTrade", status: "UNKNOWN", message: "minimum R:R not configured" };
  }
  if (rewardRisk === undefined) {
    return { limit: "maxRiskPerTrade", status: "UNKNOWN", message: "R:R not computable (stop/target incomplete)" };
  }
  return rewardRisk < minimum
    ? { limit: "maxRiskPerTrade", status: "BLOCKED", message: `R:R ${rewardRisk.toFixed(2)} below the configured minimum ${minimum.toFixed(2)}` }
    : { limit: "maxRiskPerTrade", status: "NORMAL", message: `R:R ${rewardRisk.toFixed(2)} meets the minimum ${minimum.toFixed(2)}` };
}

/** Expose the neutral status list for UI legends (same vocabulary, no new states). */
export const RISK_STATUS_VALUES = RISK_STATUSES;
export type { GuardrailStatus };
