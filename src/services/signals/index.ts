/**
 * SignalService implementation (32J).
 *
 * Bridges the deterministic signal engine (32J) to the SignalService
 * contract: derive the canonical lifecycle state from a rule-evaluation
 * trace and build a fully traceable Signal record when a setup exists
 * (WATCH or beyond). A NONE state is a fact ("no setup"), not a signal
 * record — nothing is fabricated and nothing is stored.
 *
 * The analysis result is supplied by the caller (the app-level evaluation
 * flow) so the market-data → analysis → rules → signal pipeline stays a
 * single deterministic chain with one provenance trail. The service never
 * executes and never simulates an outcome.
 */
import { buildSignal, deriveSignalState, stateRationale } from "@/domain/signals/engine";
import type { Signal, SignalState } from "@/domain/signals/signal";
import type { AnalysisResult } from "@/domain/analysis/engine";
import type { StrategyRuleSet, RuleEvaluationTrace } from "@/domain/strategy/rules";
import type { Timeframe } from "@/domain/market/timeframe";
import { asId } from "@/domain/ids";
import { serviceFailure, serviceSuccess, type ServiceResult } from "@/domain/errors";
import type { Provenance } from "@/domain/provenance/provenance";
import type { SignalService } from "@/services/index";
import type { OwnershipStamp, SignalRecordRepository } from "@/services/persistence/repository";

/** One deterministic evaluation outcome for display surfaces. */
export interface SignalEvaluation {
  readonly trace: RuleEvaluationTrace;
  readonly state: SignalState;
  readonly rationale: string;
  /** Present only when the derived state warrants a persistent record. */
  readonly signal: Signal | null;
}

export class SignalServiceImpl implements SignalService {
  private seq = 0;

  constructor(
    private readonly records: SignalRecordRepository,
    private readonly stamp: (persistedAt: string) => OwnershipStamp,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * Derive the lifecycle state from a trace; build and persist a Signal
   * record when the state warrants one (WATCH/CANDIDATE/CONFIRMED).
   * Deterministic given the inputs.
   */
  async evaluate(input: {
    strategyId: string;
    strategyVersionId: string;
    instrument: string;
    timeframe: Timeframe;
    rules: StrategyRuleSet;
    trace: RuleEvaluationTrace;
    analysis: AnalysisResult;
    /** The same validated bars the analysis consumed (stop/target derivation). */
    bars: readonly import("@/domain/market/bar").MarketBar[];
    dataProvenance: Provenance;
    observedPipSize: number;
  }): Promise<ServiceResult<SignalEvaluation>> {
    const state = deriveSignalState(input.trace);
    const rationale = stateRationale(input.trace, state);

    if (state === "NONE" || state === "INVALIDATED" || state === "EXPIRED") {
      // A no-setup / terminal evaluation is a fact, not a new signal record.
      return serviceSuccess({ trace: input.trace, state, rationale, signal: null });
    }

    this.seq += 1;
    const lastBar = input.analysis.evaluatedBar;
    const signal = buildSignal({
      id: asId<"SignalId">(`sig-${this.seq}-${this.now()}`),
      strategyId: asId<"StrategyId">(input.strategyId),
      version: { versionId: asId<"StrategyVersionId">(input.strategyVersionId) },
      rules: input.rules,
      trace: input.trace,
      state,
      analysis: input.analysis,
      bars: input.bars,
      timeframe: input.timeframe,
      dataProvenance: input.dataProvenance,
      observedPipSize: input.observedPipSize,
      signalAt: lastBar,
      intendedEntryAt: lastBar,
    });

    const put = await this.records.put(signal, this.stamp(this.now()));
    if (put.status !== "SUCCESS") return put;

    return serviceSuccess({ trace: input.trace, state, rationale, signal: put.value });
  }

  async getSignals(instrument: string): Promise<ServiceResult<readonly Signal[]>> {
    const result = await this.records.list();
    if (result.status !== "SUCCESS") return result;
    const filtered = result.value.filter((s) => s.instrument === instrument);
    return serviceSuccess([...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async getSignal(id: string): Promise<ServiceResult<Signal>> {
    const result = await this.records.get(asId<"SignalId">(id));
    if (result.status !== "SUCCESS") return result;
    if (result.value === null) return serviceFailure<Signal>("NOT_FOUND", `no signal record with id ${id}`);
    return serviceSuccess(result.value);
  }
}
