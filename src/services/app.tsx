/**
 * Application composition root (32I–32R).
 *
 * Wires the in-memory repositories (32E), the honest unconfigured market-data
 * service (32F), the research service (32G) and the new engines/services
 * (32I–32R) into one app context. Components consume this context through
 * `useAppServices` — they never touch repository SDKs or construct services
 * themselves, keeping the Presentation → Application → Domain layering intact.
 *
 * No auth, no cloud DB, no live provider: everything here is local,
 * deterministic and honest about what does not exist yet.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { MemoryCollectionRepository, MemoryPreferencesRepository } from "@/services/persistence/memory";
import type {
  ExecutedTradeRepository,
  JournalEntryRepository,
  NotificationRepository,
  PlannedTradeRepository,
  PreferencesRepository,
  SignalRecordRepository,
  WatchlistRepository,
} from "@/services/persistence/repository";
import {
  UnconfiguredMarketDataService,
  type MarketDataServiceImpl as MarketDataSvc,
} from "@/services/market";
import { researchService } from "@/services/research";
import { AnalysisServiceImpl } from "@/services/analysis";
import { StrategyServiceImpl } from "@/services/strategy";
import { SignalServiceImpl } from "@/services/signals";
import { RiskServiceImpl, DEFAULT_GUARDRAIL_PREFERENCES, type GuardrailPreferences } from "@/services/risk";
import { TradeJournalServiceImpl, userStamp } from "@/services/journal";
import { NotificationServiceImpl, MemoryNotificationRepository } from "@/services/notifications";
import { GR_STRATEGY, GR_STRATEGY_VERSION } from "@/services/strategy/seed";
import type { Strategy, StrategyVersion } from "@/domain/strategy/strategy";
import type { TradeId } from "@/domain/ids";
import { serviceSuccess, type ServiceResult } from "@/domain/errors";
import type { GuardrailCheck } from "@/domain/risk/risk";

/** Collection of all app services + the repositories they run on. */
export interface AppServices {
  readonly marketData: MarketDataSvc;
  readonly analysis: AnalysisServiceImpl;
  readonly strategy: StrategyServiceImpl;
  readonly signals: SignalServiceImpl;
  readonly risk: RiskServiceImpl;
  readonly journal: TradeJournalServiceImpl;
  readonly notifications: NotificationServiceImpl;
  readonly research: typeof researchService;
  // Repositories (exposed for pages that need direct list/put with stamps,
  // e.g. watchlist and preferences editing):
  readonly watchlistRepo: WatchlistRepository;
  readonly preferencesRepo: PreferencesRepository;
  readonly plannedTradesRepo: PlannedTradeRepository;
  readonly executedTradesRepo: ExecutedTradeRepository;
  readonly journalRepo: JournalEntryRepository;
  readonly notificationRepo: NotificationRepository;
  readonly signalRepo: SignalRecordRepository;
  /** Guardrail preference accessor shared by Settings and the risk service. */
  readonly loadGuardrailPreferences: () => Promise<GuardrailPreferences>;
  readonly saveGuardrailPreferences: (prefs: GuardrailPreferences) => Promise<ServiceResult<GuardrailPreferences>>;
  /** Seeded, frozen strategy configuration (served by StrategyService). */
  readonly seededStrategies: readonly Strategy[];
  readonly seededVersions: readonly StrategyVersion[];
}

/** Deterministic app-stage clock label for stamps created during a session. */
function sessionNow(): string {
  return new Date().toISOString();
}

function makeUserStamp() {
  return userStamp(sessionNow);
}

/** Build a complete app context. Deterministic per React tree (useMemo). */
export function createAppServices(): AppServices {
  const planned = new MemoryCollectionRepository<import("@/domain/trading/trade").PlannedTrade, import("@/domain/ids").PlannedTradeId>(
    (t) => t.id,
    (t) => (t.instrument && t.signalId ? [] : ["planned trade requires instrument and signal reference"]),
  );
  const executed = new MemoryCollectionRepository<import("@/domain/trading/trade").ExecutedTrade, TradeId>(
    (t) => t.id,
    (t) => (t.entryAt ? [] : ["executed trade requires an entry time"]),
  );
  const journal = new MemoryCollectionRepository<import("@/domain/trading/journalEntry").JournalEntry, import("@/domain/ids").JournalEntryId>(
    (e) => e.id,
  );
  const notificationRepo = new MemoryNotificationRepository();
  const watchlistRepo: WatchlistRepository = new MemoryCollectionRepository<import("@/domain/instruments/watchlist").WatchlistEntry, string>(
    (w) => w.symbol,
    (w) => (w.addedAt ? [] : ["watchlist entry requires addedAt"]),
  );
  const preferencesRepo = new MemoryPreferencesRepository();
  const signalRecords: SignalRecordRepository = new MemoryCollectionRepository<import("@/domain/signals/signal").Signal, import("@/domain/ids").SignalId>(
    (s) => s.id,
  );

  // Market data: the honest unconfigured service (32F). No live provider is
  // wired into the client — the unverified adapter stays isolated outside the
  // bundle — so the app starts with no credentials and surfaces honest
  // NOT_CONFIGURED states rather than crashing.
  const marketData = new UnconfiguredMarketDataService();
  const analysis = new AnalysisServiceImpl(marketData);
  const strategy = new StrategyServiceImpl();
  const signals = new SignalServiceImpl(signalRecords, () => makeUserStamp());
  const journalService = new TradeJournalServiceImpl(planned, executed, journal);

  // Guardrail preferences live in a module-level store within the preferences
  // document; until Settings writes them, none are configured (UNKNOWN, honest).
  let guardrailState: GuardrailPreferences = DEFAULT_GUARDRAIL_PREFERENCES;
  const loadGuardrailPreferences = async (): Promise<GuardrailPreferences> => guardrailState;
  const saveGuardrailPreferences = async (prefs: GuardrailPreferences): Promise<ServiceResult<GuardrailPreferences>> => {
    guardrailState = prefs;
    return serviceSuccess(prefs);
  };

  const risk = new RiskServiceImpl(preferencesRepo, executed, loadGuardrailPreferences, () => makeUserStamp());
  const notifications = new NotificationServiceImpl(notificationRepo, () => makeUserStamp());

  return {
    marketData,
    analysis,
    strategy,
    signals,
    risk,
    journal: journalService,
    notifications,
    research: researchService,
    watchlistRepo,
    preferencesRepo,
    plannedTradesRepo: planned,
    executedTradesRepo: executed,
    journalRepo: journal,
    notificationRepo,
    signalRepo: signalRecords,
    loadGuardrailPreferences,
    saveGuardrailPreferences,
    seededStrategies: [GR_STRATEGY],
    seededVersions: [GR_STRATEGY_VERSION],
  };
}

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ children, services }: { children: ReactNode; services?: AppServices }) {
  const value = useMemo(() => services ?? createAppServices(), [services]);
  return <AppServicesContext.Provider value={value}>{children}</AppServicesContext.Provider>;
}

/** Access the app services inside components (throws outside the provider). */
export function useAppServices(): AppServices {
  const ctx = useContext(AppServicesContext);
  if (ctx === null) throw new Error("useAppServices must be used within AppServicesProvider");
  return ctx;
}

/** Guardrail helper for the risk page: derive the worst status from checks. */
export function guardrailSummary(checks: readonly GuardrailCheck[]): { status: GuardrailCheck["status"]; explanation: string } {
  if (checks.length === 0) {
    return { status: "UNKNOWN", explanation: "no guardrails evaluated" };
  }
  const rank = { BLOCKED: 3, WARNING: 2, UNKNOWN: 1, NORMAL: 0 } as const;
  const worst = checks.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a));
  return { status: worst.status, explanation: worst.message };
}
