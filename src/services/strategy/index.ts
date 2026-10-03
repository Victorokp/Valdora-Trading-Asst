/**
 * StrategyService implementation (32J).
 *
 * Serves the seeded frozen GR-v1 strategy/version as read-only
 * configuration data, exposes the declared rule sets per direction, and
 * evaluates rules deterministically over supplied bars:
 *
 *   bars → analysis engine (32I) → observation set → rule evaluator (32J)
 *
 * The evaluation is a pure pipeline over the supplied facts. The service
 * never fetches market data itself (the caller supplies bars), never
 * executes, and never produces a recommendation — only the trace.
 */
import { computeAnalysis } from "@/domain/analysis/engine";
import { ANALYSIS_CONVENTIONS } from "@/domain/analysis/indicators";
import { asId } from "@/domain/ids";
import { serviceFailure, serviceSuccess, type ServiceResult } from "@/domain/errors";
import { registeredPipSize } from "@/domain/instruments/instrument";
import type { Direction } from "@/domain/types";
import type {
  EvaluateRulesInput,
  StrategyMethodology,
  StrategyService,
} from "@/services/index";
import type { Strategy, StrategyVersion } from "@/domain/strategy/strategy";
import type { RuleEvaluationTrace, StrategyRuleSet } from "@/domain/strategy/rules";
import { evaluateRuleSet, observationSetFrom } from "@/domain/strategy/rules";
import {
  GR_RULE_SET_LONG,
  GR_RULE_SET_SHORT,
  GR_STRATEGY,
  GR_STRATEGY_VERSION,
  GR_STRATEGY_ID,
  GR_VERSION_ID,
} from "@/services/strategy/seed";

export class StrategyServiceImpl implements StrategyService {
  async listStrategies(): Promise<ServiceResult<readonly Strategy[]>> {
    return serviceSuccess([GR_STRATEGY]);
  }

  async getStrategy(id: string): Promise<ServiceResult<Strategy>> {
    if (id !== GR_STRATEGY_ID) return serviceFailure<Strategy>("NOT_FOUND", `unknown strategy: ${id}`);
    return serviceSuccess(GR_STRATEGY);
  }

  async getStrategyVersion(versionId: string): Promise<ServiceResult<StrategyVersion>> {
    if (versionId !== GR_VERSION_ID) {
      return serviceFailure<StrategyVersion>("NOT_FOUND", `unknown strategy version: ${versionId}`);
    }
    return serviceSuccess(GR_STRATEGY_VERSION);
  }

  async getMethodology(versionId: string): Promise<ServiceResult<StrategyMethodology>> {
    const version = await this.getStrategyVersion(versionId);
    if (version.status !== "SUCCESS") return version;
    return serviceSuccess({
      versionId: version.value.versionId,
      methodologyRef: version.value.methodologyRef,
      parameters: version.value.parameters,
      researchProvenance: version.value.researchProvenance,
      executionAssumptions: [
        "Entries are evaluated on completed bars only (NEXT_BAR_OPEN timing declared in the version parameters).",
        "The app evaluates rules on demand; it never places orders and never executes.",
        "Weekly-regime rules are evaluated on the evaluation timeframe as declared configuration; no weekly resampling is performed by the app.",
      ],
    });
  }

  async getRuleSet(versionId: string, direction: Direction): Promise<ServiceResult<StrategyRuleSet>> {
    const version = await this.getStrategyVersion(versionId);
    if (version.status !== "SUCCESS") return version;
    if (versionId === GR_VERSION_ID) {
      if (direction === "LONG") return serviceSuccess(GR_RULE_SET_LONG);
      return serviceSuccess(GR_RULE_SET_SHORT); // declared out of scope — empty by construction
    }
    return serviceFailure<StrategyRuleSet>("NOT_FOUND", `no rule set registered for ${versionId}/${direction}`);
  }

  async evaluateRules(input: EvaluateRulesInput): Promise<ServiceResult<RuleEvaluationTrace>> {
    const version = await this.getStrategyVersion(input.versionId);
    if (version.status !== "SUCCESS") return version;
    const rules = await this.getRuleSet(input.versionId, input.direction);
    if (rules.status !== "SUCCESS") return rules;
    if (rules.value.entryRules.length === 0) {
      return serviceFailure<RuleEvaluationTrace>(
        "VALIDATION_ERROR",
        `the ${input.direction} side is declared out of scope for ${input.versionId} (empty rule set); nothing to evaluate`,
      );
    }
    if (input.bars.length < ANALYSIS_CONVENTIONS.minimumBars) {
      return serviceFailure<RuleEvaluationTrace>(
        "VALIDATION_ERROR",
        `insufficient data: ${input.bars.length} bars available, ${ANALYSIS_CONVENTIONS.minimumBars} required`,
      );
    }
    const pip = registeredPipSize(input.instrument);
    if (!pip.ok) {
      return serviceFailure<RuleEvaluationTrace>("VALIDATION_ERROR", `no declared pip size for ${input.instrument}`);
    }

    const analysis = computeAnalysis({
      instrument: asId<"InstrumentSymbol">(input.instrument),
      timeframe: input.bars[0].timeframe,
      bars: input.bars,
      pipSize: pip.pipSize,
      dataProvenance: { sourceType: "MARKET_DATA_PROVIDER", sourceName: "caller-supplied bars" },
    });
    const observations = observationSetFrom(analysis, input.bars);
    const evaluatedAt = input.bars[input.bars.length - 1].timestamp;
    const trace = evaluateRuleSet({ versionId: asId<"StrategyVersionId">(input.versionId) }, rules.value, observations, evaluatedAt);
    return serviceSuccess(trace);
  }
}
