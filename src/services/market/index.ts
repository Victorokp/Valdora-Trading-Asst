/**
 * Market-data service implementation (32F--32S MVP: EURUSD/1D).
 *
 * Provider-neutral: the service applies the domain quality gate to whatever
 * a MarketDataProvider returns, normalizes ordering, attaches source
 * metadata, and serves the catalog. No stale data is ever exposed as fresh,
 * and no gated path is bypassed.
 *
 * No live provider is wired at this stage: the app composes
 * `UnconfiguredMarketDataService`, and the unverified adapter under
 * `src/services/market/providers/` stays outside the import graph of both the
 * client bundle and this service until it has been independently verified.
 */
import { serviceFailure, serviceSuccess, type ServiceResult } from '@/domain/errors';
import { validateBar, type MarketBar } from '@/domain/market/bar';
import { normalizeDataset, type MarketDataQualityReport, type RawBarInput } from '@/domain/market/quality';
import type { MarketSnapshot } from '@/domain/market/snapshot';
import { isSupportedTimeframe, type Timeframe } from '@/domain/market/timeframe';
import type { Instrument } from '@/domain/instruments/instrument';
import type { MarketSessionStatus } from '@/domain/types';
import type { MarketDataService, MarketDataProvider, DataSourceMetadata } from '@/services/index';
import { getCatalogEntry, INSTRUMENT_CATALOG } from '@/services/market/catalog';
import { isRouterAware, type RouterStateView } from '@/services/market/types';

/** Sort helper: chronological by timestamp (stable). */
function chronological(bars: readonly MarketBar[]): MarketBar[] {
  return [...bars].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

const CACHE_TTL_MS = Number(process.env.VALDORA_MARKET_DATA_CACHE_TTL_MS ?? 5 * 60 * 1000);

/** Cache identity: instrument/timeframe/range within one service instance. */
function cacheKeyFor(instrument: string, timeframe: Timeframe, range: string): string {
  return `bars//${instrument}//${timeframe}//${range}`;
}

function readCache(cache: Map<string, CacheEntry>, key: string): CachedMarketBars | null {
  const slot = cache.get(key);
  if (!slot) return null;
  if (Date.now() > slot.expiresAt) {
    cache.delete(key);
    return null;
  }
  return slot.value;
}

function writeCache(cache: Map<string, CacheEntry>, key: string, value: CachedMarketBars): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

const STALE_GRACE_MS = Number(process.env.VALDORA_MARKET_DATA_STALE_GRACE_MS ?? 15 * 60 * 1000);

interface CachedMarketBars {
  readonly bars: readonly MarketBar[];
  readonly receivedAt: string;
}

interface CacheEntry {
  readonly value: CachedMarketBars;
  readonly expiresAt: number;
}

export class MarketDataServiceImpl implements MarketDataService {
  /** Per-instance dataset cache: one service instance owns its cached bars. */
  private readonly barsCache = new Map<string, CacheEntry>();
  /** Last quality-gate report per instrument, exactly as evaluated. */
  private readonly qualityReports = new Map<string, MarketDataQualityReport>();

  constructor(private readonly provider: MarketDataProvider | null) {}

  async getDataSourceStatus(): Promise<ServiceResult<DataSourceMetadata>> {
    if (!this.provider) {
      return serviceSuccess({
        status: 'NOT_CONFIGURED',
        mode: 'UNKNOWN',
        note: 'No market-data provider is configured. Nothing is displayed as live.',
      });
    }
    if (isRouterAware(this.provider)) {
      return this.dataSourceFromRouter(this.provider.getRouterState());
    }
    return serviceSuccess({
      status: 'AVAILABLE',
      mode: this.provider.mode,
      sourceLabel: this.provider.name,
    });
  }

  /**
   * Honest data-source metadata from router state (32T Phase 5/11):
   * primary live → AVAILABLE `Live — <provider>`; fallback live → DEGRADED
   * `Live — <provider> fallback`; served from the router snapshot cache →
   * DEGRADED `Using cached market data` (never presented as live); all
   * providers failed → UNAVAILABLE; no enabled provider → NOT_CONFIGURED.
   */
  private dataSourceFromRouter(state: RouterStateView): ServiceResult<DataSourceMetadata> {
    if (!state.anyEnabled) {
      return serviceSuccess({
        status: 'NOT_CONFIGURED',
        mode: 'UNKNOWN',
        note: 'No market-data provider configured. Nothing is displayed as live.',
      });
    }
    const outcome = state.outcome;
    if (outcome === null) {
      return serviceSuccess({
        status: 'AVAILABLE',
        mode: 'LIVE',
        sourceLabel: state.enabledLabels[0],
        note: 'Provider configured — awaiting first data request',
      });
    }
    if (outcome.fulfillment === 'CACHE') {
      return serviceSuccess({
        status: 'DEGRADED',
        mode: 'LIVE',
        sourceLabel: outcome.servedBy,
        // Original retrieval clock of the cached dataset (32T Phase 9):
        // consumers can tell when the data was actually fetched.
        ...(outcome.retrievedAt !== undefined ? { retrievedAt: outcome.retrievedAt } : {}),
        note: 'Using cached market data',
      });
    }
    if (outcome.fulfillment === 'NONE') {
      return serviceFailure('UNAVAILABLE', 'market data unavailable: every configured provider failed');
    }
    return serviceSuccess({
      status: outcome.usedFallback ? 'DEGRADED' : 'AVAILABLE',
      mode: 'LIVE',
      sourceLabel: outcome.servedBy,
      // Retrieval clock of the served dataset (32T Phase 9); absent only
      // when the provider recorded none — never invented.
      ...(outcome.retrievedAt !== undefined ? { retrievedAt: outcome.retrievedAt } : {}),
      note: outcome.note ?? `Live — ${outcome.servedBy ?? 'unknown provider'}`,
    });
  }

  async getInstrumentMetadata(symbol: string): Promise<ServiceResult<Instrument>> {
    const entry = getCatalogEntry(symbol);
    if (!entry) return serviceFailure('NOT_FOUND', `unknown instrument: ${symbol}`);
    return serviceSuccess(entry);
  }

  async listInstruments(): Promise<ServiceResult<readonly Instrument[]>> {
    return serviceSuccess(
      INSTRUMENT_CATALOG.map((entry) => ({
        symbol: entry.symbol,
        displayName: entry.displayName,
        baseCurrency: entry.baseCurrency,
        quoteCurrency: entry.quoteCurrency,
        assetClass: entry.assetClass,
        pipSize: entry.pipSize,
        role: entry.role,
        researchLineage: entry.researchLineage,
        dataAvailability: entry.dataAvailability,
      })),
    );
  }

  async getMarketStatus(_symbol: string): Promise<ServiceResult<MarketSessionStatus>> {
    // No live session source exists; UNKNOWN is the honest state.
    return serviceSuccess('UNKNOWN');
  }

  async getLatestSnapshot(symbol: string): Promise<ServiceResult<MarketSnapshot>> {
    if (!this.provider) {
      return serviceFailure('NOT_CONFIGURED', 'No market-data provider is configured; no snapshot is available.');
    }
    const result = await this.provider.getBars(symbol, 'DAILY', '5d');
    if (result.status !== 'SUCCESS') return result;
    const bars = result.value;
    if (bars.length === 0) {
      return serviceFailure('NOT_FOUND', `no recent data for ${symbol}`);
    }
    const last = bars[bars.length - 1];
    const problems = validateBar(last);
    if (problems.length > 0) {
      return serviceFailure('VALIDATION_ERROR', `latest bar failed validation: ${problems.join(', ')}`);
    }
    // Router-aware providers expose which source actually served this data
    // (primary/fallback/cached) plus its retrieval clock — provenance never
    // guesses and cached data is never labeled live (32T Phase 9).
    const routerState = isRouterAware(this.provider) ? this.provider.getRouterState() : null;
    const outcome = routerState?.outcome ?? null;
    const servedBy = outcome?.servedBy ?? this.provider.name;
    const fromCache = outcome?.fulfillment === 'CACHE';
    const notes = fromCache
      ? 'Using cached market data — not a live quote.'
      : this.provider.mode === 'HISTORICAL'
        ? 'Fixture/historical data, not a live quote.'
        : undefined;
    return serviceSuccess({
      instrument: symbol,
      observedAt: last.timestamp,
      ...(outcome?.retrievedAt !== undefined ? { receivedAt: outcome.retrievedAt } : {}),
      price: { value: last.close, observedAt: last.timestamp },
      provenance: {
        sourceType: 'MARKET_DATA_PROVIDER',
        sourceName: servedBy,
        ...(notes !== undefined ? { notes } : {}),
      },
    });
  }

  async getHistoricalBars(symbol: string, timeframe: Timeframe, range: string): Promise<ServiceResult<readonly MarketBar[]>> {
    const tfCheck = isSupportedTimeframe(timeframe);
    if (!tfCheck) {
      return serviceFailure('VALIDATION_ERROR', `unsupported timeframe: ${timeframe}`);
    }
    if (!this.provider) {
      return serviceFailure('NOT_CONFIGURED', 'No market-data provider is configured; no chart data is available.');
    }

    const key = cacheKeyFor(symbol, timeframe, range);
    const cached = readCache(this.barsCache, key);
    if (cached !== null) {
      const received = Date.parse(cached.receivedAt);
      const ageMs = Number.isNaN(received) ? Number.POSITIVE_INFINITY : Date.now() - received;
      if (ageMs > STALE_GRACE_MS) {
        // Stale data is never served (and never crashes): evict it and report
        // the honest UNAVAILABLE state with the staleness reason attached.
        this.barsCache.delete(key);
        return serviceFailure('UNAVAILABLE', `cached market data is stale (received ${cached.receivedAt}; stale grace ${STALE_GRACE_MS}ms)`);
      }
      return serviceSuccess(cached.bars);
    }

    const result = await this.provider.getBars(symbol, timeframe, range);
    if (result.status !== 'SUCCESS') {
      return result;
    }

    const raw: RawBarInput[] = result.value.map((b) => ({ ...b }));
    const gate = normalizeDataset(raw);
    this.qualityReports.set(symbol, gate.report);
    if (!gate.ok) {
      return serviceFailure(
        'VALIDATION_ERROR',
        `dataset failed the market-data quality gate (${gate.report.errors.length} errors; e.g. ${gate.report.errors[0]?.code})`,
        JSON.stringify(gate.report),
      );
    }

    const serialized: CachedMarketBars = { bars: gate.bars, receivedAt: new Date().toISOString() };
    writeCache(this.barsCache, key, serialized);
    return serviceSuccess(gate.bars);
  }

  /** Last quality-gate report evaluated for this instrument (null when none ran yet). */
  async getLastQualityReport(symbol: string): Promise<ServiceResult<MarketDataQualityReport | null>> {
    return serviceSuccess(this.qualityReports.get(symbol) ?? null);
  }
}

/**
 * The current-stage service: no provider configured. Every data request
 * returns NOT_CONFIGURED  -  the UI renders honest unavailable states.
 */
export class UnconfiguredMarketDataService extends MarketDataServiceImpl {
  constructor() {
    super(null);
  }
}

/**
 * Deterministic fixture provider (tests/demos only). Data is static, labeled
 * HISTORICAL, and never presented as live by the service layer.
 */
export class StaticMarketDataProvider implements MarketDataProvider {
  readonly name = 'static-fixture' as const;
  readonly mode = 'HISTORICAL' as const;

  constructor(private readonly fixtures: Readonly<Record<string, readonly RawBarInput[]>>) {}

  async getBars(symbol: string, timeframe: Timeframe, _range: string): Promise<ServiceResult<readonly MarketBar[]>> {
    const raw = this.fixtures[symbol];
    if (!raw) return serviceFailure('NOT_FOUND', `no fixture dataset for ${symbol}`);
    // Reuse the same normalization path so fixtures obey the same gate.
    const gate = normalizeDataset(raw.map((b) => ({ ...b, timeframe })));
    if (!gate.ok) return serviceFailure('VALIDATION_ERROR', 'fixture dataset failed quality gate', JSON.stringify(gate.report));
    return serviceSuccess(chronological(gate.bars));
  }
}
