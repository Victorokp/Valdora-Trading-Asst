/**
 * Domain layer barrel. Pure TypeScript types + deterministic helpers only:
 * no I/O, no UI, no research imports, no network, no side effects.
 */
export * from "@/domain/ids";
export * from "@/domain/errors";
export * from "@/domain/types";
export * from "@/domain/instruments/instrument";
export * from "@/domain/market/timeframe";
export * from "@/domain/market/bar";
export * from "@/domain/market/snapshot";
export * from "@/domain/market/indicator";
export * from "@/domain/analysis/analysis";
export * from "@/domain/analysis/indicators";
export * from "@/domain/analysis/engine";
export * from "@/domain/strategy/strategy";
export * from "@/domain/strategy/rules";
export * from "@/domain/signals/signal";
export * from "@/domain/signals/reconciliation";
export * from "@/domain/signals/engine";
export * from "@/domain/research/evidence";
export * from "@/domain/research/phase30";
export * from "@/domain/risk/risk";
export * from "@/domain/risk/engine";
export * from "@/domain/trading/trade";
export * from "@/domain/trading/executionTiming";
export * from "@/domain/trading/lifecycle";
export * from "@/domain/trading/journalEntry";
export * from "@/domain/performance/performance";
export * from "@/domain/performance/snapshot";
export * from "@/domain/provenance/provenance";
export * from "@/domain/ai/context";
export * from "@/domain/notifications/notification";
export * from "@/domain/preferences/preferences";
