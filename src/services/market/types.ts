/**
 * Normalized market bar (Part 1 §7).
 *
 * 32D: the canonical bar type is `MarketBar` in the domain layer. This alias
 * keeps the architecture's `NormalizedBar` name available to market-data
 * adapters without a second bar definition.
 *
 * 32T: router capability types live here so the service layer can consume
 * router state through a duck-typed optional interface WITHOUT importing the
 * router module — the client bundle never pulls in provider code.
 */
export type { MarketBar as NormalizedBar } from "@/domain/market/bar";

/** Health of one provider inside the market-data router. */
export type RouterProviderHealth = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "DISABLED";

/** Observable state of a single router-managed provider. */
export interface RouterProviderState {
  readonly id: string;
  readonly label: string;
  readonly health: RouterProviderHealth;
  readonly verification: "VERIFIED" | "UNVERIFIED";
  readonly consecutiveFailures: number;
  /** Last typed failure class observed for this provider, when any. */
  readonly lastFailureKind?: string;
  /** ISO-8601 instant until which the circuit breaker stays open, when open. */
  readonly circuitOpenUntil?: string;
}

/** How the most recent data request was fulfilled. */
export type RouterFulfillment = "LIVE" | "CACHE" | "NONE";

/** Outcome of the most recent router request — the honesty surface for the UI. */
export interface RouterOutcome {
  readonly fulfillment: RouterFulfillment;
  /** Provider label that produced the served dataset (live, or cached origin). */
  readonly servedBy?: string;
  /** True when the served provider was not the first enabled provider. */
  readonly usedFallback?: boolean;
  /** Retrieval clock of the served data (ISO-8601). */
  readonly retrievedAt?: string;
  readonly instrument?: string;
  readonly timeframe?: string;
  /** Honest label, e.g. `Live — Twelve Data`, `Using cached market data`. */
  readonly note?: string;
  /** Candle-boundary warning raised when a provider switch changed semantics. */
  readonly boundaryWarning?: string;
}

/** Router state as observed by the service layer. */
export interface RouterStateView {
  /** True when at least one provider is VERIFIED and credentialed. */
  readonly anyEnabled: boolean;
  /** Labels of enabled providers in deterministic fallback order. */
  readonly enabledLabels: readonly string[];
  /** Outcome of the most recent request; null before the first request. */
  readonly outcome: RouterOutcome | null;
  readonly providers: readonly RouterProviderState[];
}

/**
 * Optional capability: a `MarketDataProvider` that exposes router state.
 * The service duck-types this so `src/services/market/index.ts` keeps a
 * type-only dependency and the client bundle stays provider-free.
 */
export interface RouterAwareProvider {
  getRouterState(): RouterStateView;
}

/** Type guard for the optional router capability. */
export function isRouterAware(provider: object): provider is RouterAwareProvider {
  return typeof (provider as { getRouterState?: unknown }).getRouterState === "function";
}
