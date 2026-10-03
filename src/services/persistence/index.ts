/**
 * Persistence foundation (32E) — public surface.
 *
 * Repositories are USER_DATA only by construction. Research artifacts stay
 * behind the ResearchService boundary; nothing here stores them.
 */
export type {
  CollectionRepository,
  DataOwnership,
  ExecutedTradeRepository,
  JournalEntryRepository,
  NotificationRepository,
  OwnershipStamp,
  PerformanceSnapshotRepository,
  PlannedTradeRepository,
  PreferencesRepository,
  RepositorySerializer,
  SignalRecordRepository,
  StrategyRepository,
  StrategyVersionRepository,
  WatchlistRepository,
} from "@/services/persistence/repository";
export {
  createJsonSerializer,
} from "@/services/persistence/repository";
export {
  MemoryCollectionRepository,
  MemoryPreferencesRepository,
} from "@/services/persistence/memory";

import type { OwnershipStamp } from "@/services/persistence/repository";

/** Deterministic test fixture stamp (fixed timestamp — never a live clock). */
export function testStamp(): OwnershipStamp {
  return { ownership: "USER_DATA", persistedAt: "2026-09-28T00:00:00Z" };
}
