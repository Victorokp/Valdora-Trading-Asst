/**
 * RiskService implementation (32K).
 *
 * Serves the aggregate risk state and guardrail evaluation from explicit
 * inputs only: the user's configured guardrails (preferences repository)
 * and what their journal actually reports (open trades, drawdown from the
 * closed-R path). Nothing is assumed:
 *
 * - no guardrails configured → every limit UNKNOWN with an explanation
 * - no journal trades        → exposure/drawdown UNKNOWN, never zero-by-default
 * - candidate evaluation     → geometry+sizing UNKNOWN when inputs are missing,
 *                              every BLOCKED/UNKNOWN outcome explains why
 *
 * No account size is ever defaulted; no broker/account integration exists.
 */
import type { DrawdownSummary, ExposureSummary, GuardrailCheck, RiskGuardrails, RiskState } from "@/domain/risk/risk";
import {
  checkMinimumRewardRisk,
  computePositionSizing,
  evaluateGuardrails,
  evaluateTradeGeometry,
  worstStatus,
  type PositionSizing,
  type TradeRiskEvaluation,
} from "@/domain/risk/engine";
import { registeredPipSize } from "@/domain/instruments/instrument";
import { serviceSuccess, type ServiceResult } from "@/domain/errors";
import { computeUserPerformance } from "@/services/performance";
import type { ExecutedTradeRepository, OwnershipStamp, PreferencesRepository } from "@/services/persistence/repository";
import type { CandidateRiskEvaluation, RiskService } from "@/services/index";
import type { UserPreferences } from "@/domain/preferences/preferences";

/** Guardrail limits the user configures (stored in preferences extension). */
export interface GuardrailPreferences {
  readonly guardrails: RiskGuardrails;
  /** Minimum reward:risk a candidate must meet (optional; checked separately). */
  readonly minRewardRisk?: number;
}

export const DEFAULT_GUARDRAIL_PREFERENCES: GuardrailPreferences = { guardrails: {} };

export class RiskServiceImpl implements RiskService {
  constructor(
    private readonly preferences: PreferencesRepository,
    private readonly executedTrades: ExecutedTradeRepository,
    /** Returns the configured guardrail preferences (defaults to none configured). */
    private readonly loadGuardrails: () => Promise<GuardrailPreferences> = async () => DEFAULT_GUARDRAIL_PREFERENCES,
    private readonly stamp: (persistedAt: string) => OwnershipStamp = () => ({ ownership: "USER_DATA", persistedAt: "1970-01-01T00:00:00Z" }),
  ) {}

  async getGuardrails(): Promise<ServiceResult<RiskGuardrails>> {
    const prefs = await this.loadGuardrails();
    return serviceSuccess(prefs.guardrails);
  }

  async getRiskState(): Promise<ServiceResult<RiskState>> {
    const checks = await this.getGuardrailState();
    if (checks.status !== "SUCCESS") return checks;
    const guardrailStatus = worstStatus(checks.value.map((c) => c.status));
    return serviceSuccess({
      guardrails: checks.value,
      guardrailStatus,
      status: guardrailStatus,
      assessedAt: this.stamp(new Date().toISOString()).persistedAt,
    });
  }

  async getGuardrailState(): Promise<ServiceResult<readonly GuardrailCheck[]>> {
    const exposure = await this.getExposureSummary();
    const drawdown = await this.getDrawdownSummary();
    const prefs = await this.loadGuardrails();
    const openTrades = exposure.status === "SUCCESS" ? exposure.value.openTrades : undefined;
    const openExposureR = exposure.status === "SUCCESS" ? exposure.value.openExposureR : undefined;
    const currentDrawdownR = drawdown.status === "SUCCESS" ? drawdown.value.currentDrawdownR : undefined;
    return serviceSuccess(
      evaluateGuardrails({
        guardrails: prefs.guardrails,
        openTrades,
        openExposureR,
        currentDrawdownR,
      }),
    );
  }

  async getExposureSummary(): Promise<ServiceResult<ExposureSummary>> {
    const result = await this.executedTrades.list();
    if (result.status !== "SUCCESS") return result;
    const open = result.value.filter((t) => t.exitAt === undefined);
    if (open.length === 0) {
      // Honest: nothing is open as reported; counts stay absent rather than zero-by-default.
      return serviceSuccess({ status: "UNKNOWN" });
    }
    return serviceSuccess({
      openTrades: open.length,
      openExposureR: undefined, // per-trade risk fraction is not recorded yet; never fabricated
      status: "UNKNOWN",
    });
  }

  async getDrawdownSummary(): Promise<ServiceResult<DrawdownSummary>> {
    const result = await this.executedTrades.list();
    if (result.status !== "SUCCESS") return result;
    const summary = computeUserPerformance(result.value, this.stamp(new Date().toISOString()).persistedAt);
    if (!summary.hasTrades) {
      return serviceSuccess({ status: "UNKNOWN" });
    }
    return serviceSuccess({
      maxDrawdownR: summary.performance.maxDrawdownR,
      currentDrawdownR: summary.performance.maxDrawdownR === 0 ? 0 : undefined,
      status: "NORMAL",
    });
  }

  async evaluateCandidate(input: {
    direction: "LONG" | "SHORT";
    instrument: string;
    entry?: number;
    stop?: number;
    target?: number;
  }): Promise<ServiceResult<CandidateRiskEvaluation>> {
    const pip = registeredPipSize(input.instrument);
    const geometry: TradeRiskEvaluation = evaluateTradeGeometry({
      direction: input.direction,
      entry: input.entry,
      stop: input.stop,
      target: input.target,
      pipSize: pip.ok ? pip.pipSize : undefined,
    });

    const prefs = await this.loadGuardrails();
    const equity = await this.loadAccountEquity();
    const sizing: PositionSizing = computePositionSizing({
      stopDistancePips: geometry.stopDistancePips,
      pipSize: pip.ok ? pip.pipSize : undefined,
      pipValuePerLot: pip.ok ? quotePipValuePerLot(pip.pipSize) : undefined,
      accountEquity: equity.value,
      riskFraction: prefs.guardrails.maxRiskPerTrade,
    });

    const guardrailChecks: GuardrailCheck[] = [
      ...evaluateGuardrails({
        guardrails: prefs.guardrails,
        candidateRiskFraction: sizing.riskFraction,
      }),
    ];
    if (prefs.minRewardRisk !== undefined) {
      guardrailChecks.push(checkMinimumRewardRisk(geometry.rewardRisk, prefs.minRewardRisk));
    }

    const aggregateStatus = worstStatus([
      ...guardrailChecks.map((c) => c.status),
      geometry.geometryValid === false ? "BLOCKED" : "UNKNOWN",
      sizing.status,
    ]);

    return serviceSuccess({ geometry, guardrailChecks, sizing, aggregateStatus });
  }

  /** Account equity is UNKNOWN until the user configures it — never a default. */
  private async loadAccountEquity(): Promise<{ value?: number }> {
    const load = await this.preferences.load();
    if (load.status !== "SUCCESS" || load.value === null) return { value: undefined };
    const prefs: UserPreferences = load.value;
    void prefs; // account equity is not part of the current preference contract; stays unknown
    return { value: undefined };
  }
}

/**
 * Quote-currency value of one pip per standard lot for USD-quoted majors —
 * a DECLARED convention of this app stage (pipSize × 100,000 units), not a
 * market-derived figure.
 */
function quotePipValuePerLot(pipSize: number): number {
  return pipSize * 100_000;
}
