/**
 * Repository interfaces (32E — persistence foundation).
 *
 * OWNERSHIP MODEL (the core 32E boundary):
 *
 * 1. USER_DATA   — mutable, private, account-owned (journal, preferences…).
 * 2. RESEARCH    — immutable frozen artifacts. Externally governed by
 *                  research integrity; NEVER stored in a user repository and
 *                  never mutated by the app. Read only through the
 *                  ResearchService boundary.
 * 3. MARKET_DATA — external/provider-owned; the app caches copies with full
 *                  provenance but owns nothing.
 * 4. DERIVED     — computed by services from the above; reproducible.
 *
 * Repositories here are USER_DATA only. Research artifacts are deliberately
 * absent — they are not user-owned mutable data.
 *
 * Persistence-technology note: the async + serialization seams below are what
 * a future cloud adapter (Supabase/Convex/Postgres, none currently installed)
 * implements behind the SAME interfaces — no domain/service rewrite.
 */
import type { ServiceResult } from "@/domain/errors";
import type { JournalEntryId, NotificationId, PerformanceSnapshotId, PlannedTradeId, SignalId, StrategyId, StrategyVersionId, TradeId } from "@/domain/ids";
import type { JournalEntry } from "@/domain/trading/journalEntry";
import type { Notification } from "@/domain/notifications/notification";
import type { PerformanceSnapshot } from "@/domain/performance/snapshot";
import type { UserPreferences } from "@/domain/preferences/preferences";
import type { PlannedTrade, ExecutedTrade } from "@/domain/trading/trade";
import type { Signal } from "@/domain/signals/signal";
import type { Strategy, StrategyVersion } from "@/domain/strategy/strategy";
import type { WatchlistEntry } from "@/domain/instruments/watchlist";

/** What a repository may store. RESEARCH is deliberately not a member. */
export type DataOwnership =
  | "USER_DATA"
  | "MARKET_DATA"
  | "DERIVED";

/** Metadata every stored user record carries. */
export interface OwnershipStamp {
  readonly ownership: DataOwnership;
  /** Account owner id, when the app has one (no auth exists yet). */
  readonly ownerId?: string;
  /** ISO-8601 persistence time. */
  readonly persistedAt: string;
}

/** The single-document repositories (preferences). */
export interface PreferencesRepository {
  load(): Promise<ServiceResult<UserPreferences | null>>;
  save(prefs: UserPreferences, stamp: OwnershipStamp): Promise<ServiceResult<UserPreferences>>;
  clear(): Promise<ServiceResult<null>>;
}

/** Generic collection repository contract for user-owned entity lists. */
export interface CollectionRepository<T, ID> {
  list(): Promise<ServiceResult<readonly T[]>>;
  get(id: ID): Promise<ServiceResult<T | null>>;
  put(entity: T, stamp: OwnershipStamp): Promise<ServiceResult<T>>;
  remove(id: ID): Promise<ServiceResult<null>>;
}

export interface JournalEntryRepository extends CollectionRepository<JournalEntry, JournalEntryId> {}
export interface ExecutedTradeRepository extends CollectionRepository<ExecutedTrade, TradeId> {}
export interface PlannedTradeRepository extends CollectionRepository<PlannedTrade, PlannedTradeId> {}
export interface NotificationRepository extends CollectionRepository<Notification, NotificationId> {
  listUnread(): Promise<ServiceResult<readonly Notification[]>>;
  markRead(id: NotificationId): Promise<ServiceResult<Notification>>;
}
export interface PerformanceSnapshotRepository extends CollectionRepository<PerformanceSnapshot, PerformanceSnapshotId> {}
export interface WatchlistRepository extends CollectionRepository<WatchlistEntry, string> {}

/**
 * Strategy repositories. Strategies/versions are USER_DATA configuration
 * (the app's own strategy entities — NOT the frozen research artifacts).
 * Frozen versions are immutable by domain rule; repositories reject a `put`
 * that changes an existing frozen version's parameters (enforced by tests).
 */
export interface StrategyRepository extends CollectionRepository<Strategy, StrategyId> {}
export interface StrategyVersionRepository extends CollectionRepository<StrategyVersion, StrategyVersionId> {}

/**
 * Signal records: user-owned record-keeping of signals the (future) engine
 * produced — the records themselves are app data, not research evidence.
 */
export interface SignalRecordRepository extends CollectionRepository<Signal, SignalId> {}

/** Serialization boundary for future persistence adapters. */
export interface RepositorySerializer<T> {
  readonly entityName: string;
  serialize(entity: T): string;
  deserialize(raw: string): ServiceResult<T>;
}

/** Deterministic JSON serializer; deserialization is validated, never trusting. */
export function createJsonSerializer<T>(entityName: string): RepositorySerializer<T> {
  return {
    entityName,
    serialize(entity: T): string {
      return JSON.stringify(entity, null, 2);
    },
    deserialize(raw: string): ServiceResult<T> {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object") {
          return { status: "VALIDATION_ERROR", error: { status: "VALIDATION_ERROR", message: `${entityName}: expected an object` } };
        }
        return { status: "SUCCESS", value: parsed as T };
      } catch (error) {
        return {
          status: "VALIDATION_ERROR",
          error: { status: "VALIDATION_ERROR", message: `${entityName}: malformed JSON`, detail: String(error) },
        };
      }
    },
  };
}
