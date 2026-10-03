/**
 * Provider-neutral adapter contracts (multi-provider market-data architecture).
 *
 * This module is the ONLY vocabulary provider adapters speak. Provider
 * response objects never leave their adapter: every adapter normalizes into
 * `ProviderDataset` (provider-neutral bars + provenance) or reports a typed
 * `ProviderFailure`. The router consumes these contracts; the domain and the
 * application layer never see a provider payload.
 *
 * Rules encoded here (32T specification):
 * - The canonical internal representation is provider-neutral:
 *   instrument, timeframe, OHLC, timestamp, provider identity, source
 *   provenance, retrieval clock, quality status, failure/rate-limit state.
 * - Provider timestamps are preserved VERBATIM. Adapters never re-stamp,
 *   merge or restack candles, and never change candle boundaries; any
 *   boundary semantics caveat travels in `candleBoundary`.
 * - Failures are typed so the router can make deterministic fallback
 *   decisions instead of falling back on every error.
 * - Nothing in this layer may ever carry a credential in a value that can
 *   be surfaced (messages, datasets, state). Keys are held only by the
 *   adapter instance that needs them to authenticate a request.
 */
import type { MarketBar } from '@/domain/market/bar';
import type { CandleBoundaryInfo } from '@/domain/market/boundary';
import type { MarketDataQualityReport } from '@/domain/market/quality';
import type { Timeframe } from '@/domain/market/timeframe';

/** Stable identifiers for the three configured providers. */
export type ProviderId = 'TWELVE_DATA' | 'MASSIVE' | 'ALPHA_VANTAGE';

/**
 * Contract verification state. VERIFIED means the external API contract
 * (base URL, auth, symbol format, endpoint, parameters, response shape,
 * timestamp semantics, error and rate-limit behavior) was checked against
 * the provider's own documentation (and a live probe where possible) —
 * NOT merely that TypeScript compiles. UNVERIFIED providers are hard-wired
 * disabled regardless of credentials.
 */
export type ProviderVerification = 'VERIFIED' | 'UNVERIFIED';

/** A data request as the application layer formulates it (provider-neutral). */
export interface ProviderBarRequest {
  /** Catalog instrument symbol, e.g. `EURUSD`. */
  readonly instrument: string;
  readonly timeframe: Timeframe;
  /** Deterministic range grammar: `<positive integer><d|w|y>` (e.g. `5d`, `1y`). */
  readonly range: string;
}

/**
 * Typed failure classes. The router maps these onto deterministic decisions:
 *
 * - REQUEST_REJECTED — our request violates the provider's verified contract
 *   (HTTP 400 / invalid parameters). Deterministic: the chain ABORTS instead
 *   of trying other providers, so contract drift surfaces loudly instead of
 *   being papered over by a fallback.
 * - AUTH / RATE_LIMITED / TIMEOUT / NETWORK / PROVIDER / MALFORMED /
 *   CONTRACT_MISMATCH / INVALID_DATA / NOT_FOUND — provider-specific faults:
 *   the router records health and falls back to the next provider.
 * - CONFIGURATION — no credential supplied by the server boundary; the
 *   provider is skipped as DISABLED.
 * - UNSUPPORTED — this provider cannot serve the requested timeframe; the
 *   router skips it without penalizing its health.
 */
export type ProviderFailureKind =
  | 'CONFIGURATION'
  | 'AUTH'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'REQUEST_REJECTED'
  | 'NOT_FOUND'
  | 'MALFORMED'
  | 'CONTRACT_MISMATCH'
  | 'INVALID_DATA'
  | 'UNSUPPORTED'
  | 'PROVIDER';

export interface ProviderFailure {
  readonly kind: ProviderFailureKind;
  /** User-safe message. Never contains credentials, URLs with keys or raw payloads. */
  readonly message: string;
}

/** Provider metadata captured verbatim from a successful response. */
export interface ProviderSourceMeta {
  /** Instrument name echoed by the provider (verbatim), when present. */
  readonly reportedSymbol?: string;
  /** Timeframe/interval echoed by the provider (verbatim), when present. */
  readonly reportedTimeframe?: string;
}

/** One normalized, provider-neutral dataset. Every field is explicit. */
export interface ProviderDataset {
  readonly providerId: ProviderId;
  /** Human-readable provider identity, e.g. `Twelve Data`. */
  readonly providerLabel: string;
  readonly instrument: string;
  readonly timeframe: Timeframe;
  /** Chronological, provider-neutral bars. Timestamps verbatim from the source. */
  readonly bars: readonly MarketBar[];
  /** When the application received this dataset (ISO-8601, app clock). */
  readonly retrievedAt: string;
  /** Candle-boundary semantics as documented by the provider (never assumed). */
  readonly candleBoundary: CandleBoundaryInfo;
  readonly sourceMeta: ProviderSourceMeta;
  /** Filled in by the router's quality gate before a dataset is served/cached. */
  readonly qualityReport?: MarketDataQualityReport;
}

export type ProviderAdapterResult =
  | { readonly ok: true; readonly dataset: ProviderDataset }
  | { readonly ok: false; readonly failure: ProviderFailure };

/** Request as handed to the transport (never contains credentials in the URL). */
export interface ProviderHttpRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

export interface ProviderHttpResponse {
  readonly status: number;
  readonly body: string;
}

/**
 * Transport seam. Adapters take an injectable transport so tests exercise
 * the full parsing/classification path with recorded fixtures and zero
 * network access. The production implementation is `fetchTransport`.
 */
export type ProviderTransport = (request: ProviderHttpRequest) => Promise<ProviderHttpResponse>;

/** Every provider adapter satisfies this contract. */
export interface ProviderAdapter {
  readonly id: ProviderId;
  /** Display label used in provenance and UI (e.g. `Twelve Data`). */
  readonly label: string;
  readonly verification: ProviderVerification;
  /**
   * Active only when the contract is VERIFIED and the server boundary
   * supplied a credential. UNVERIFIED providers return false always.
   */
  isEnabled(): boolean;
  getBars(request: ProviderBarRequest): Promise<ProviderAdapterResult>;
}

/** Strip a secret from any provider-supplied text before it can be surfaced. */
export function redactSecret(text: string, secret: string | null | undefined): string {
  if (!secret) return text;
  const trimmed = secret.trim();
  if (trimmed.length === 0) return text;
  return text.split(trimmed).join('[redacted]');
}

/** Bound provider-supplied error text so raw payloads are never echoed wholesale. */
export function boundMessage(text: string, limit = 240): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

/**
 * Deterministic range grammar shared by adapters:
 * `<positive integer><d|w|y>` → number of calendar days.
 * Returns null for anything else (adapters reject deterministically).
 */
export function rangeToDays(range: string): number | null {
  const match = /^(\d+)([dwy])$/.exec(range);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount < 1) return null;
  switch (match[2]) {
    case 'd':
      return amount;
    case 'w':
      return amount * 7;
    case 'y':
      return amount * 365;
    default:
      return null;
  }
}

/** Shared instrument shape guard: six uppercase letters (e.g. `EURUSD`). */
export function isSixLetterSymbol(instrument: string): boolean {
  return /^[A-Z]{6}$/.test(instrument);
}
