/**
 * Opaque, typed identifiers (32D).
 *
 * IDs are branded strings: they flow through the system as plain strings but
 * are not interchangeable at the type level (a TradeId is not a SignalId).
 * No ID-generation infrastructure is introduced here — producers (persistence
 * in 32E+) choose their generator; the domain only guarantees that IDs it
 * receives stay distinguishable and cannot be silently mixed.
 */

/** Nominal brand: makes `Brand<string, "X">` distinct from every other string type. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type StrategyId = Brand<string, "StrategyId">;
export type StrategyVersionId = Brand<string, "StrategyVersionId">;
export type SignalId = Brand<string, "SignalId">;
export type TradeId = Brand<string, "TradeId">;
export type PlannedTradeId = Brand<string, "PlannedTradeId">;
export type NotificationId = Brand<string, "NotificationId">;
export type JournalEntryId = Brand<string, "JournalEntryId">;
export type PerformanceSnapshotId = Brand<string, "PerformanceSnapshotId">;
export type ResearchPhaseId = Brand<string, "ResearchPhaseId">;
export type InstrumentSymbol = Brand<string, "InstrumentSymbol">;

/** Wrap a raw string into a branded ID. Correctness of the value is the caller's duty. */
export function asId<B extends string>(value: string): Brand<string, B> {
  return value as Brand<string, B>;
}
