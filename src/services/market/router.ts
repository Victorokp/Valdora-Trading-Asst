/**
 * MarketDataRouter — deterministic multi-provider fallback (32T Phase 5).
 *
 * Fallback order (fixed, deterministic): Twelve Data (primary) → Massive
 * (fallback) → Alpha Vantage (emergency, hard-disabled while UNVERIFIED) →
 * cached last-valid snapshot → UNAVAILABLE.
 *
 * Fallback is CLASSIFIED, never blanket:
 * - CONFIGURATION / disabled → provider skipped as DISABLED (no call).
 * - UNSUPPORTED (timeframe this provider cannot serve) → skipped, no penalty.
 * - AUTH, RATE_LIMITED, TIMEOUT, NETWORK, MALFORMED, CONTRACT_MISMATCH,
 *   INVALID_DATA (quality-gate reject), NOT_FOUND, PROVIDER → provider health
 *   is recorded and the chain falls through to the next provider.
 * - REQUEST_REJECTED (HTTP 400: our request violates the provider's verified
 *   contract) → the chain ABORTS with VALIDATION_ERROR. Contract drift must
 *   surface loudly instead of being papered over by a fallback.
 *
 * Circuit breaker: after `failureThreshold` consecutive penalized failures a
 * provider's circuit opens for `cooldownMs`; while open it is skipped
 * (UNAVAILABLE). After the cooldown the next request is a half-open trial —
 * success restores HEALTHY automatically (deterministic, injected clock).
 *
 * Data integrity: a served dataset always comes from EXACTLY ONE provider —
 * bars are never merged across providers. Before serving, the dataset passes
 * the domain quality gate (with expected-instrument enforcement); a gate
 * failure rejects that provider's data and falls through to the next.
 * When every provider fails, the last-valid snapshot for the exact
 * instrument/timeframe/range (provider-identified) may be served — surfaced
 * as fulfillment=CACHE ("Using cached market data"), never as live data —
 * or else the router returns NOT_CONFIGURED / UNAVAILABLE honestly.
 *
 * This module is intentionally NOT imported by the client bundle: the app
 * composition root keeps the honest unconfigured service until a server-side
 * boundary exists to inject credentials.
 */
import { serviceFailure, serviceSuccess, type ServiceResult } from '@/domain/errors';
import {
  assessAgainstResearch,
  compareBoundaries,
  type CandleBoundaryDeclaration,
} from '@/domain/market/boundary';
import type { MarketBar } from '@/domain/market/bar';
import { normalizeDataset, type RawBarInput } from '@/domain/market/quality';
import type { Timeframe } from '@/domain/market/timeframe';
import type { MarketDataProvider } from '@/services/index';
import type {
  RouterOutcome,
  RouterProviderHealth,
  RouterProviderState,
  RouterStateView,
} from '@/services/market/types';
import type {
  ProviderAdapter,
  ProviderAdapterResult,
  ProviderBarRequest,
  ProviderDataset,
  ProviderFailureKind,
} from '@/services/market/providers/types';
import { TwelveDataAdapter } from '@/services/market/providers/twelveData';
import { MassiveAdapter } from '@/services/market/providers/massive';
import { AlphaVantageAdapter } from '@/services/market/providers/alphaVantage';

/** Fallback-worthy failure classes (recorded + fall through). */
const FALLBACK_KINDS: ReadonlySet<ProviderFailureKind> = new Set<ProviderFailureKind>([
  'AUTH',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK',
  'MALFORMED',
  'CONTRACT_MISMATCH',
  'INVALID_DATA',
  'PROVIDER',
]);

export interface MarketDataRouterOptions {
  /** Injected clock (epoch ms) — tests drive cooldowns deterministically. */
  readonly now?: () => number;
  /** Consecutive penalized failures before a circuit opens. Default 2. */
  readonly failureThreshold?: number;
  /** Circuit-open cooldown in ms. Default 60_000. */
  readonly cooldownMs?: number;
  /** Max age of the last-valid snapshot served when every provider fails. Default 15 min. */
  readonly snapshotTtlMs?: number;
}

interface RouterEntry {
  readonly adapter: ProviderAdapter;
  health: RouterProviderHealth;
  consecutiveFailures: number;
  lastFailureKind?: ProviderFailureKind;
  circuitOpenUntilMs?: number;
}

interface StoredSnapshot {
  readonly dataset: ProviderDataset;
  readonly storedAtMs: number;
}

function toRawInputs(bars: readonly MarketBar[]): RawBarInput[] {
  return bars.map((bar) => ({
    instrument: bar.instrument,
    timeframe: bar.timeframe,
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    ...(bar.volume !== undefined ? { volume: bar.volume } : {}),
  }));
}

export class MarketDataRouter implements MarketDataProvider {
  readonly name = 'MarketDataRouter' as const;
  /** Providers behind the router are live feeds; disabled state is reported separately. */
  readonly mode = 'LIVE' as const;

  private readonly entries: RouterEntry[];
  private readonly now: () => number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly snapshotTtlMs: number;

  /** Last-valid datasets keyed by instrument/timeframe/range (provider identity inside the value). */
  private readonly snapshots = new Map<string, StoredSnapshot>();
  /** Last served boundary declaration per instrument/timeframe (provider-switch detection). */
  private readonly lastBoundary = new Map<string, CandleBoundaryDeclaration>();
  private outcome: RouterOutcome | null = null;

  constructor(adapters: readonly ProviderAdapter[], options: MarketDataRouterOptions = {}) {
    this.entries = adapters.map((adapter) => ({
      adapter,
      health: adapter.isEnabled() ? 'HEALTHY' : 'DISABLED',
      consecutiveFailures: 0,
    }));
    this.now = options.now ?? (() => Date.now());
    this.failureThreshold = options.failureThreshold ?? 2;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.snapshotTtlMs = options.snapshotTtlMs ?? 15 * 60_000;
  }

  /** Deterministic provider order as configured (primary first). */
  get adapterOrder(): readonly ProviderAdapter[] {
    return this.entries.map((entry) => entry.adapter);
  }

  getRouterState(): RouterStateView {
    const providers: RouterProviderState[] = this.entries.map((entry) => ({
      id: entry.adapter.id,
      label: entry.adapter.label,
      health: entry.health,
      verification: entry.adapter.verification,
      consecutiveFailures: entry.consecutiveFailures,
      ...(entry.lastFailureKind !== undefined ? { lastFailureKind: entry.lastFailureKind } : {}),
      ...(entry.circuitOpenUntilMs !== undefined
        ? { circuitOpenUntil: new Date(entry.circuitOpenUntilMs).toISOString() }
        : {}),
    }));
    const enabled = this.entries.filter((entry) => entry.adapter.isEnabled());
    return {
      anyEnabled: enabled.length > 0,
      enabledLabels: enabled.map((entry) => entry.adapter.label),
      outcome: this.outcome,
      providers,
    };
  }

  async getBars(instrument: string, timeframe: Timeframe, range: string): Promise<ServiceResult<readonly MarketBar[]>> {
    const nowMs = this.now();
    const cacheKey = `${instrument}//${timeframe}//${range}`;
    const failures: string[] = [];
    /** Typed failure class recorded per attempted provider (UNSUPPORTED skipped). */
    const recordedKinds: ProviderFailureKind[] = [];
    const enabledEntries = this.entries.filter((entry) => entry.adapter.isEnabled());
    let attempted = 0;
    let firstEnabledLabel: string | undefined = enabledEntries[0]?.adapter.label;

    for (const entry of this.entries) {
      if (!entry.adapter.isEnabled()) {
        entry.health = 'DISABLED';
        continue;
      }
      if (entry.circuitOpenUntilMs !== undefined && nowMs < entry.circuitOpenUntilMs) {
        failures.push(`${entry.adapter.label}: circuit open (cooldown until ${new Date(entry.circuitOpenUntilMs).toISOString()})`);
        continue;
      }

      attempted += 1;
      const request: ProviderBarRequest = { instrument, timeframe, range };
      const result: ProviderAdapterResult = await entry.adapter.getBars(request);

      if (result.ok) {
        const gate = normalizeDataset(toRawInputs(result.dataset.bars), { expectedInstrument: instrument });
        if (!gate.ok) {
          const first = gate.report.errors[0];
          this.recordFailure(entry, 'INVALID_DATA', true);
          recordedKinds.push('INVALID_DATA');
          failures.push(
            `${entry.adapter.label}: quality gate rejected dataset (${gate.report.errors.length} errors${first ? `; e.g. ${first.code}` : ''})`,
          );
          continue;
        }
        const dataset: ProviderDataset = { ...result.dataset, bars: gate.bars, qualityReport: gate.report };
        this.snapshots.set(cacheKey, { dataset, storedAtMs: nowMs });
        this.recordSuccess(entry);

        const usedFallback = firstEnabledLabel !== undefined && entry.adapter.label !== firstEnabledLabel;
        const boundaryWarning = this.trackBoundary(instrument, timeframe, dataset, entry.adapter.label);
        this.outcome = {
          fulfillment: 'LIVE',
          servedBy: entry.adapter.label,
          usedFallback,
          retrievedAt: dataset.retrievedAt,
          instrument,
          timeframe,
          note: usedFallback ? `Live — ${entry.adapter.label} fallback` : `Live — ${entry.adapter.label}`,
          ...(boundaryWarning !== undefined ? { boundaryWarning } : {}),
        };
        return serviceSuccess(gate.bars);
      }

      const { kind, message } = result.failure;
      const detail = `${entry.adapter.label}: ${message}`;
      if (kind === 'UNSUPPORTED') {
        // Capability gap for this request — skipped without health penalty.
        failures.push(`${detail} (unsupported for this request)`);
        continue;
      }
      if (kind === 'REQUEST_REJECTED') {
        // Deterministic contract violation: abort the chain, never mask it.
        this.recordFailure(entry, kind, true);
        this.outcome = { fulfillment: 'NONE', instrument, timeframe, note: 'Market data unavailable' };
        return serviceFailure('VALIDATION_ERROR', `market-data request rejected — ${detail}`);
      }
      if (kind === 'CONFIGURATION') {
        entry.health = 'DISABLED';
        entry.lastFailureKind = kind;
        failures.push(`${detail} (disabled)`);
        continue;
      }
      if (kind === 'NOT_FOUND') {
        // Data gap for this symbol/window — fall through without circuit penalty.
        entry.lastFailureKind = kind;
        recordedKinds.push(kind);
        failures.push(`${detail} (no data)`);
        continue;
      }
      if (FALLBACK_KINDS.has(kind)) {
        this.recordFailure(entry, kind, true);
        recordedKinds.push(kind);
        failures.push(detail);
        continue;
      }
      // Defensive: any unclassified kind still falls through, penalized.
      this.recordFailure(entry, kind, true);
      recordedKinds.push(kind);
      failures.push(detail);
    }

    // All providers failed or were skipped → cached last-valid snapshot.
    const cached = this.snapshots.get(cacheKey);
    if (cached !== undefined && nowMs - cached.storedAtMs <= this.snapshotTtlMs) {
      const origin = cached.dataset.providerLabel;
      this.outcome = {
        fulfillment: 'CACHE',
        servedBy: origin,
        usedFallback: true,
        retrievedAt: cached.dataset.retrievedAt,
        instrument,
        timeframe,
        note: 'Using cached market data',
      };
      return serviceSuccess(cached.dataset.bars);
    }

    this.outcome = { fulfillment: 'NONE', instrument, timeframe, note: 'Market data unavailable' };
    if (enabledEntries.length === 0) {
      return serviceFailure('NOT_CONFIGURED', 'No market-data provider is configured (every provider is disabled).');
    }
    if (attempted === 0) {
      return serviceFailure('UNAVAILABLE', `market data unavailable: all providers are cooling down (${failures.join('; ')})`);
    }
    // When EVERY attempted provider failed the quality gate, the honest
    // status is an explicit quality rejection — not a generic outage.
    if (
      recordedKinds.length === attempted &&
      recordedKinds.length > 0 &&
      recordedKinds.every((k) => k === 'INVALID_DATA')
    ) {
      return serviceFailure(
        'VALIDATION_ERROR',
        `market data rejected by the quality gate from every attempted provider (${failures.join('; ')})`,
      );
    }
    return serviceFailure('UNAVAILABLE', `market data unavailable: ${failures.join('; ')}`);
  }

  /** Record a successful trial: reset breaker, HEALTHY. */
  private recordSuccess(entry: RouterEntry): void {
    entry.health = 'HEALTHY';
    entry.consecutiveFailures = 0;
    entry.lastFailureKind = undefined;
    entry.circuitOpenUntilMs = undefined;
  }

  /** Record a penalized failure: DEGRADED below threshold, circuit opens at threshold. */
  private recordFailure(entry: RouterEntry, kind: ProviderFailureKind, penalize: boolean): void {
    entry.lastFailureKind = kind;
    if (!penalize) return;
    entry.consecutiveFailures += 1;
    if (entry.consecutiveFailures >= this.failureThreshold) {
      entry.health = 'UNAVAILABLE';
      entry.circuitOpenUntilMs = this.now() + this.cooldownMs;
    } else if (entry.health !== 'DISABLED') {
      entry.health = 'DEGRADED';
    }
  }

  /**
   * Track candle-boundary semantics across provider switches: when the
   * serving provider changes for an instrument/timeframe, compare boundary
   * declarations and surface a mismatch warning instead of pretending the
   * providers' daily candles are interchangeable.
   */
  private trackBoundary(
    instrument: string,
    timeframe: Timeframe,
    dataset: ProviderDataset,
    label: string,
  ): string | undefined {
    const key = `${instrument}//${timeframe}`;
    const declaration: CandleBoundaryDeclaration = {
      source: label,
      providerStatement: dataset.candleBoundary.providerStatement,
      ...(dataset.candleBoundary.sourceTimezone !== undefined
        ? { sourceTimezone: dataset.candleBoundary.sourceTimezone }
        : {}),
      confidence: dataset.candleBoundary.confidence,
    };
    const previous = this.lastBoundary.get(key);
    this.lastBoundary.set(key, declaration);
    const assessment = assessAgainstResearch(declaration);
    if (previous === undefined || previous.source === label) return undefined;
    const comparison = compareBoundaries(previous, declaration);
    if (comparison.alignment === 'MATCH') return undefined;
    return `${comparison.report} ${assessment.report}`;
  }
}

/**
 * Default client-side router: every adapter constructed WITHOUT credentials —
 * all providers DISABLED (Alpha Vantage additionally UNVERIFIED). A future
 * server-side boundary constructs the same router with server-held keys:
 *
 *   new MarketDataRouter([
 *     new TwelveDataAdapter({ apiKey: serverTwelveDataKey }),
 *     new MassiveAdapter({ apiKey: serverMassiveKey }),
 *     new AlphaVantageAdapter({ apiKey: serverAlphaVantageKey }),
 *   ])
 *
 * Keys (server env only): TWELVEDATA_API_KEY, MASSIVE_API_KEY,
 * ALPHAVANTAGE_API_KEY. They must never be read in client code.
 */
export function createDefaultMarketDataRouter(options: MarketDataRouterOptions = {}): MarketDataRouter {
  return new MarketDataRouter(createDefaultAdapters(), options);
}

/**
 * The default adapter set: all constructed WITHOUT credentials — every
 * provider DISABLED (Alpha Vantage additionally UNVERIFIED). Tests and the
 * future server boundary pass their own adapter lists to `new MarketDataRouter(...)`.
 */
export function createDefaultAdapters(): ProviderAdapter[] {
  return [
    new TwelveDataAdapter({ apiKey: null }),
    new MassiveAdapter({ apiKey: null }),
    new AlphaVantageAdapter({ apiKey: null }),
  ];
}
