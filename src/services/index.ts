/**
 * Application service contracts (32D: typed interfaces only — no implementation).
 *
 * Layering (Part 1 §3): Presentation → Application Services → Domain →
 * Infrastructure. These interfaces are the application layer's seams; the
 * presentation layer renders structured results from them only and never
 * computes trading logic.
 *
 * Boundary rules carried forward (Part 2 §15):
 * - `ResearchService` is the ONLY reader of the frozen research evidence.
 * - `AIService` is the only component that may ever talk to AI providers.
 * - `TradeJournalService` stores what the user reports; it never computes
 *   strategy logic.
 * - No live provider, broker, database, auth or AI integration exists yet.
 *
 * Implementations arrive in later workstreams (persistence 32E, market data
 * 32F, research viewer 32G/H, AI 32I).
 */
import type {
  AIContext,
  AIResponse,
} from "@/domain/ai/context";
import type { MarketAnalysis } from "@/domain/analysis/analysis";
import type { ServiceResult } from "@/domain/errors";
import type { Instrument } from "@/domain/instruments/instrument";
import type { MarketBar } from "@/domain/market/bar";
import type { MarketSnapshot } from "@/domain/market/snapshot";
import type { Timeframe } from "@/domain/market/timeframe";
import type { Notification } from "@/domain/notifications/notification";
import type { Phase30Readiness } from "@/domain/research/phase30";
import type { ResearchRef } from "@/domain/research/evidence";
import type {
  EvidenceAssessment,
  ResearchPhaseSummary,
} from "@/domain/research/evidence";
import type { DrawdownSummary, ExposureSummary, GuardrailCheck, RiskGuardrails, RiskState } from "@/domain/risk/risk";
import type { Signal } from "@/domain/signals/signal";
import type { Strategy, StrategyVersion } from "@/domain/strategy/strategy";
import type { RuleEvaluationTrace, StrategyRuleSet } from "@/domain/strategy/rules";
import type { ExecutedTrade, PlannedTrade } from "@/domain/trading/trade";
import type { JournalEntry } from "@/domain/trading/journalEntry";
import type {
  HistoricalResearchPerformance,
  UserTradePerformance,
} from "@/domain/performance/performance";
import type { Direction, MarketSessionStatus } from "@/domain/types";

// --- Shared presentation mapping ---------------------------------------------

/** The five UI states every data-dependent view must support (Part 2 §17). */
export interface UIStateResult<T> {
  readonly state: "LOADING" | "SUCCESS" | "EMPTY" | "ERROR" | "UNAVAILABLE";
  readonly data: T | null;
  readonly error?: { readonly code: string; readonly message: string };
}

/** Map a canonical service result onto the five UI states (pure, total). */
export function toUIState<T>(result: ServiceResult<T>, emptyWhen?: (value: T) => boolean): UIStateResult<T> {
  if (result.status === "SUCCESS") {
    const isEmpty = emptyWhen ? emptyWhen(result.value) : false;
    return isEmpty ? { state: "EMPTY", data: null } : { state: "SUCCESS", data: result.value };
  }
  if (result.status === "NOT_CONFIGURED" || result.status === "UNAVAILABLE" || result.status === "RATE_LIMITED") {
    return { state: "UNAVAILABLE", data: null, error: { code: result.status, message: result.error.message } };
  }
  return { state: "ERROR", data: null, error: { code: result.status, message: result.error.message } };
}

// --- Market data (Part 1 §7) --------------------------------------------------

/** Raw provider abstraction; concrete providers arrive with the market-data workstream. */
export interface MarketDataProvider {
  readonly name: string;
  /** Whether the provider serves historical records or a live feed. */
  readonly mode: DataMode;
  getBars(instrument: string, timeframe: Timeframe, range: string): Promise<ServiceResult<readonly MarketBar[]>>;
}

/**
 * MarketDataService — normalized, provenance-stamped market state for the
 * app. Contract only: no provider calls exist in 32D.
 */
/** Data-source availability for the market-data layer. */
export type DataSourceStatus =
  | "NOT_CONFIGURED" // no provider configured yet (current stage)
  | "DEGRADED"       // provider configured but partially failing
  | "AVAILABLE";     // provider healthy

/** How a dataset was obtained. Live feeds are NOT used in this stage. */
export type DataMode = "HISTORICAL" | "LIVE" | "UNKNOWN";

/** Availability/degraded metadata accompanying market-data responses. */
export interface DataSourceMetadata {
  readonly status: DataSourceStatus;
  readonly mode: DataMode;
  /** Provider/source label when a source exists. */
  readonly sourceLabel?: string;
  /**
   * Retrieval clock of the data that actually served, when one was recorded
   * (ISO-8601). Undefined = not recorded — never fabricated.
   */
  readonly retrievedAt?: string;
  /** Factual note, e.g. degraded-scope explanation. */
  readonly note?: string;
}

export interface MarketDataService {
  /** Latest observed snapshot; absent fields mean "not observed" (never fabricated). */
  getLatestSnapshot(instrument: Instrument["symbol"]): Promise<ServiceResult<MarketSnapshot>>;
  /** Historical bars for one instrument/timeframe. */
  getHistoricalBars(instrument: Instrument["symbol"], timeframe: Timeframe, range: string): Promise<ServiceResult<readonly MarketBar[]>>;
  /** Instrument metadata (catalog data, not market data). */
  getInstrumentMetadata(instrument: Instrument["symbol"]): Promise<ServiceResult<Instrument>>;
  /** Session status for the instrument. */
  getMarketStatus(instrument: Instrument["symbol"]): Promise<ServiceResult<MarketSessionStatus>>;
  /** Availability/degraded state of the data source itself. */
  getDataSourceStatus(): Promise<ServiceResult<DataSourceMetadata>>;
}

// --- Analysis / signals --------------------------------------------------------

export interface AnalysisRequest {
  readonly instrument: Instrument["symbol"];
  readonly timeframe: Timeframe;
}

/** AnalysisService: structured observation/interpretation results (Part 1 §8). */
export interface AnalysisService {
  /** Neutral analysis for one instrument/timeframe; never a trading signal. */
  analyze(request: AnalysisRequest): Promise<ServiceResult<MarketAnalysis>>;
}

/** SignalService: reads signal lifecycle records. Generation arrives with the strategy engine. */
export interface SignalService {
  /** Signals for an instrument, any lifecycle state. */
  getSignals(instrument: Instrument["symbol"]): Promise<ServiceResult<readonly Signal[]>>;
  getSignal(id: string): Promise<ServiceResult<Signal>>;
}

// --- Strategy (Part 1 §9/§10) ---------------------------------------------------

/** Methodology metadata of a strategy version (explainability payload). */
export interface StrategyMethodology {
  readonly versionId: string;
  readonly methodologyRef: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly researchProvenance: readonly ResearchRef[];
  /** Declared differences from the frozen research semantics, when any. */
  readonly executionAssumptions?: readonly string[];
}

export interface StrategyService {
  listStrategies(): Promise<ServiceResult<readonly Strategy[]>>;
  getStrategy(id: string): Promise<ServiceResult<Strategy>>;
  getStrategyVersion(versionId: string): Promise<ServiceResult<StrategyVersion>>;
  /** Methodology metadata for explainability; no signal generation in 32D. */
  getMethodology(versionId: string): Promise<ServiceResult<StrategyMethodology>>;
  /**
   * Evaluate a version's declared rules for a direction over supplied market
   * facts (32J). Deterministic; returns the full pass/fail/unavailable trace.
   */
  evaluateRules(input: EvaluateRulesInput): Promise<ServiceResult<RuleEvaluationTrace>>;
  /** The declared rule set of a version (configuration data). */
  getRuleSet(versionId: string, direction: Direction): Promise<ServiceResult<StrategyRuleSet>>;
}

/** Inputs for a deterministic rule evaluation. */
export interface EvaluateRulesInput {
  readonly versionId: string;
  readonly direction: Direction;
  /** Validated, chronologically-sorted bars for the evaluation timeframe. */
  readonly bars: readonly MarketBar[];
  readonly instrument: Instrument["symbol"];
}

// --- Risk (Part 1 §13/§14) --------------------------------------------------------

export interface RiskService {
  /** Current aggregate risk state (no broker/account integration yet). */
  getRiskState(): Promise<ServiceResult<RiskState>>;
  /** Per-limit guardrail checks. */
  getGuardrailState(): Promise<ServiceResult<readonly GuardrailCheck[]>>;
  getExposureSummary(): Promise<ServiceResult<ExposureSummary>>;
  getDrawdownSummary(): Promise<ServiceResult<DrawdownSummary>>;
  /**
   * Evaluate a candidate trade's geometry + configured guardrails (32K).
   * Every blocked/unknown outcome carries a factual explanation; account
   * data that does not exist is reported UNKNOWN, never assumed.
   */
  evaluateCandidate(input: {
    readonly direction: "LONG" | "SHORT";
    readonly instrument: Instrument["symbol"];
    readonly entry?: number;
    readonly stop?: number;
    readonly target?: number;
  }): Promise<ServiceResult<CandidateRiskEvaluation>>;
  /** The user's configured guardrail limits (empty = none configured). */
  getGuardrails(): Promise<ServiceResult<RiskGuardrails>>;
}

/** Full candidate-trade risk evaluation (geometry + guardrails + sizing). */
export interface CandidateRiskEvaluation {
  readonly geometry: import("@/domain/risk/engine").TradeRiskEvaluation;
  readonly guardrailChecks: readonly GuardrailCheck[];
  readonly sizing: import("@/domain/risk/engine").PositionSizing;
  readonly aggregateStatus: import("@/domain/risk/risk").RiskStatus;
}

// --- Trade journal (Part 1 §15) ------------------------------------------------------

export interface TradeJournalFilter {
  readonly instrument?: Instrument["symbol"];
  readonly openOnly?: boolean;
}

export interface TradeJournalService {
  listPlannedTrades(filter?: TradeJournalFilter): Promise<ServiceResult<readonly PlannedTrade[]>>;
  listExecutedTrades(filter?: TradeJournalFilter): Promise<ServiceResult<readonly ExecutedTrade[]>>;
  getExecutedTrade(id: string): Promise<ServiceResult<ExecutedTrade>>;
  /** Store a user-reported execution; the service never computes strategy logic. */
  recordExecutedTrade(trade: ExecutedTrade): Promise<ServiceResult<ExecutedTrade>>;
  /** Create a planned trade (32L). Deriving one is deterministic; executing is the user's act. */
  createPlannedTrade(trade: PlannedTrade): Promise<ServiceResult<PlannedTrade>>;
  getPlannedTrade(id: string): Promise<ServiceResult<PlannedTrade>>;
  /** Remove a plan that was never executed (the plan is user data). */
  discardPlannedTrade(id: string): Promise<ServiceResult<null>>;
  /** Journal entries (user-authored notes/reviews — always USER_DATA). */
  listJournalEntries(): Promise<ServiceResult<readonly JournalEntry[]>>;
  createJournalEntry(entry: Omit<JournalEntry, "id" | "createdAt">): Promise<ServiceResult<JournalEntry>>;
}

// --- Performance (Part 1 §16 — never mixed) ---------------------------------------------

export interface PerformanceService {
  /** Computed ONLY from the user's journal. */
  getUserPerformance(): Promise<ServiceResult<UserTradePerformance>>;
  /**
   * Read-only historical research performance from frozen artifacts, with
   * mandatory limitations. Must be rendered on a separate surface from
   * getUserPerformance — never in the same chart, table or summary.
   */
  getHistoricalResearchPerformance(): Promise<ServiceResult<HistoricalResearchPerformance>>;
}

// --- Research (Part 2 §1/§2/§15 — the frozen-evidence boundary) ----------------------------

/**
 * ResearchService — the ONLY reader of the frozen research evidence.
 *
 * Contract rule (Part 2 §1): the application consumes research through this
 * service only. Implementations (32G/H) must expose artifact-backed data and
 * must never: import research Python modules, execute research code, or read
 * frozen CSVs from React components. The application layer must not know how
 * the research was calculated.
 */
export interface ResearchService {
  /** All research phases with neutral status/evidence states. */
  listPhases(): Promise<ServiceResult<readonly ResearchPhaseSummary[]>>;
  getPhase(phaseId: string): Promise<ServiceResult<ResearchPhaseSummary>>;
  /** Evidence assessments for a phase (neutral states only). */
  getPhaseEvidence(phaseId: string): Promise<ServiceResult<readonly EvidenceAssessment[]>>;
  /** Provenance references backing a phase's claims (artifact + commit + hashes). */
  getResearchRefs(phaseId: string): Promise<ServiceResult<readonly ResearchRef[]>>;
  /** Phase 30 readiness — factual gate state (currently PENDING). */
  getPhase30Readiness(): Promise<ServiceResult<Phase30Readiness>>;
  /** Research metrics explicitly supported by a frozen artifact (never inferred). */
  getPhaseMetrics(phaseId: string): Promise<ServiceResult<readonly ResearchMetric[]>>;
  /** Human-readable description + methodology context for a phase. */
  getPhaseDescription(phaseId: string): Promise<ServiceResult<ResearchPhaseDescription>>;
}

/**
 * A research metric EXPLICITLY supported by a frozen artifact. The value and
 * label travel together with their reference; the UI cannot invent a metric
 * because it cannot construct one without a ref.
 */
export interface ResearchMetric {
  readonly label: string;
  /** Exact value string as displayed (e.g. "+32.2644R"). */
  readonly value: string;
  readonly ref: ResearchRef;
}

/** Human-readable phase description + methodology context (artifact-backed). */
export interface ResearchPhaseDescription {
  readonly phaseId: string;
  readonly purpose: string;
  readonly methodology: string;
  readonly data: string;
  readonly results: string;
  /** Mandatory block. */
  readonly limitations: readonly string[];
  /** Provenance the description itself is based on. */
  readonly refs: readonly ResearchRef[];
}

// --- Notifications (Part 2 §24 — no delivery) --------------------------------------------------

export interface NotificationService {
  /** Unread notifications, newest first. */
  listUnread(): Promise<ServiceResult<readonly Notification[]>>;
  /** All notifications (read + unread). */
  listAll(): Promise<ServiceResult<readonly Notification[]>>;
  /** Unread count (drives the bell badge). */
  unreadCount(): Promise<ServiceResult<number>>;
  markRead(id: string): Promise<ServiceResult<Notification>>;
  /** Mark every unread notification read. */
  markAllRead(): Promise<ServiceResult<number>>;
  /** Record a new notification (in-app only; no external delivery). */
  create(input: {
    readonly type: Notification["type"];
    readonly severity: Notification["severity"];
    readonly title: string;
    readonly message: string;
    readonly relatedEntity?: Notification["relatedEntity"];
  }): Promise<ServiceResult<Notification>>;
}

// --- AI (Part 2 §7/§8/§9 — explanation layer only) -----------------------------------------------

/**
 * AIService — the only component that may ever talk to AI providers.
 *
 * CRITICAL: it *accepts structured context* (provenance-stamped domain data)
 * and *returns structured response metadata*. The AI is an explanation layer;
 * it can never become the source of truth for prices, research results, risk
 * values or strategy parameters, because those enter only as citations.
 * No provider is configured in 32D; no API keys exist client-side, ever.
 */
export interface AIService {
  /** Question/answer over the structured context. */
  ask(context: AIContext): Promise<ServiceResult<AIResponse>>;
  /** Streaming variant where appropriate; chunks assemble into an AIResponse. */
  stream(context: AIContext): AsyncIterable<ServiceResult<AIResponse>>;
}
