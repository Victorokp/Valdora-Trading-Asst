/**
 * MarketDataRouter tests (32T Phase 5/7/8/9/10).
 *
 * Covers: deterministic fallback chains, classified failures (no blanket
 * fallback), disabled skipping, circuit breaker + automatic recovery,
 * cached-last-valid snapshot with honest CACHE surfacing, single-provider
 * data integrity (no mixed series), quality-gate rejection before serving,
 * provider-switch candle-boundary detection, and the service-level
 * data-source/provenance mapping the UI consumes.
 */
import { describe, expect, it } from 'vitest';

import type { MarketBar } from '@/domain/market/bar';
import type { Timeframe } from '@/domain/market/timeframe';
import { AnalysisServiceImpl } from '@/services/analysis';
import { MarketDataServiceImpl } from '@/services/market';
import {
  MarketDataRouter,
  createDefaultAdapters,
  createDefaultMarketDataRouter,
} from '@/services/market/router';
import type {
  ProviderAdapter,
  ProviderAdapterResult,
  ProviderBarRequest,
  ProviderDataset,
  ProviderFailureKind,
} from '@/services/market/providers/types';

interface FakeAdapterControl {
  readonly adapter: ProviderAdapter;
  readonly calls: readonly ProviderBarRequest[];
  setRespond(fn: (request: ProviderBarRequest) => ProviderAdapterResult): void;
}

function fail(kind: ProviderFailureKind, message = `synthetic ${kind}`): ProviderAdapterResult {
  return { ok: false, failure: { kind, message } };
}

function makeBars(instrument: string, dates: readonly string[]): MarketBar[] {
  return dates.map((timestamp, i) => ({
    instrument,
    timeframe: 'DAILY' as Timeframe,
    timestamp,
    open: 1.1 + i * 0.001,
    high: 1.2,
    low: 1.0,
    close: 1.15,
  }));
}

function makeDataset(
  id: ProviderAdapter['id'],
  label: string,
  request: ProviderBarRequest,
  options: {
    dates?: readonly string[];
    instrument?: string;
    boundary?: { providerStatement: string; sourceTimezone?: string; confidence: 'DOCUMENTED' | 'AMBIGUOUS' };
  } = {},
): ProviderDataset {
  const instrument = options.instrument ?? request.instrument;
  return {
    providerId: id,
    providerLabel: label,
    instrument,
    timeframe: request.timeframe,
    bars: makeBars(instrument, options.dates ?? ['2026-09-29', '2026-09-30', '2026-10-01']),
    retrievedAt: '2026-10-03T12:00:00.000Z',
    candleBoundary: options.boundary ?? {
      providerStatement: `${label} daily windows (test double).`,
      confidence: 'DOCUMENTED',
      sourceTimezone: 'America/New_York',
    },
    sourceMeta: { reportedTimeframe: '1day' },
  };
}

function fakeAdapter(
  id: ProviderAdapter['id'],
  label: string,
  options: { enabled?: boolean; verification?: 'VERIFIED' | 'UNVERIFIED' } = {},
): FakeAdapterControl {
  const calls: ProviderBarRequest[] = [];
  const verification = options.verification ?? 'VERIFIED';
  let respond = (request: ProviderBarRequest): ProviderAdapterResult => ({
    ok: true,
    dataset: makeDataset(id, label, request),
  });
  const adapter: ProviderAdapter = {
    id,
    label,
    verification,
    isEnabled: () => (options.enabled ?? true) && verification === 'VERIFIED',
    getBars: async (request) => {
      calls.push(request);
      return respond(request);
    },
  };
  return {
    adapter,
    calls,
    setRespond: (fn) => {
      respond = fn;
    },
  };
}

function timestamps(result: Awaited<ReturnType<MarketDataRouter['getBars']>>): string[] {
  if (result.status !== 'SUCCESS') throw new Error(`expected SUCCESS, got ${result.status}`);
  return result.value.map((b) => b.timestamp);
}

describe('MarketDataRouter — deterministic fallback chains', () => {
  it('serves from the primary provider when it succeeds', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(timestamps(result)).toStrictEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    const state = router.getRouterState();
    expect(state.outcome).toMatchObject({
      fulfillment: 'LIVE',
      servedBy: 'Twelve Data',
      usedFallback: false,
      note: 'Live — Twelve Data',
    });
    expect(state.providers.map((p) => p.health)).toStrictEqual(['HEALTHY', 'HEALTHY']);
    expect(b.calls).toHaveLength(0);
  });

  it('falls back to the secondary when the primary is rate-limited', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond(() => fail('RATE_LIMITED'));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(timestamps(result)).toStrictEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    const state = router.getRouterState();
    expect(state.outcome).toMatchObject({
      fulfillment: 'LIVE',
      servedBy: 'Massive',
      usedFallback: true,
      note: 'Live — Massive fallback',
    });
    expect(state.providers[0]).toMatchObject({ health: 'DEGRADED', lastFailureKind: 'RATE_LIMITED', consecutiveFailures: 1 });
  });

  it('walks the full chain primary → secondary → tertiary', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    const c = fakeAdapter('ALPHA_VANTAGE', 'Alpha Vantage');
    a.setRespond(() => fail('TIMEOUT'));
    b.setRespond(() => fail('PROVIDER'));
    const router = new MarketDataRouter([a.adapter, b.adapter, c.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('SUCCESS');
    expect(router.getRouterState().outcome).toMatchObject({
      servedBy: 'Alpha Vantage',
      usedFallback: true,
      note: 'Live — Alpha Vantage fallback',
    });
  });

  it('returns UNAVAILABLE with typed reasons when every enabled provider fails and no cache exists', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond(() => fail('RATE_LIMITED', 'twelve limited'));
    b.setRespond(() => fail('NETWORK', 'massive network'));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('UNAVAILABLE');
    if (result.status === 'SUCCESS') throw new Error('unreachable');
    expect(result.error.message).toContain('Twelve Data: twelve limited');
    expect(result.error.message).toContain('Massive: massive network');
    expect(router.getRouterState().outcome).toMatchObject({ fulfillment: 'NONE', note: 'Market data unavailable' });
  });

  it('returns NOT_CONFIGURED when every provider is disabled', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data', { enabled: false });
    const b = fakeAdapter('MASSIVE', 'Massive', { verification: 'UNVERIFIED' });
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('NOT_CONFIGURED');
    expect(a.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(0);
    const state = router.getRouterState();
    expect(state.anyEnabled).toBe(false);
    expect(state.providers.every((p) => p.health === 'DISABLED')).toBe(true);
  });

  it('skips disabled providers without calling them but keeps deterministic order for the rest', async () => {
    const order: string[] = [];
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data', { enabled: false });
    const b = fakeAdapter('MASSIVE', 'Massive');
    const c = fakeAdapter('ALPHA_VANTAGE', 'Alpha Vantage');
    b.setRespond(() => {
      order.push('Massive');
      return fail('PROVIDER');
    });
    c.setRespond((r) => {
      order.push('Alpha Vantage');
      return { ok: true, dataset: makeDataset('ALPHA_VANTAGE', 'Alpha Vantage', r) };
    });
    const router = new MarketDataRouter([a.adapter, b.adapter, c.adapter], { now: () => 0 });
    await router.getBars('EURUSD', 'DAILY', '5d');
    expect(order).toStrictEqual(['Massive', 'Alpha Vantage']);
    expect(a.calls).toHaveLength(0);
  });

  it('preserves configured provider order across repeated requests', async () => {
    const order: string[] = [];
    const make = (id: ProviderAdapter['id'], label: string) => {
      const fake = fakeAdapter(id, label);
      fake.setRespond(() => {
        order.push(label);
        return fail('PROVIDER');
      });
      return fake;
    };
    const a = make('TWELVE_DATA', 'Twelve Data');
    const b = make('MASSIVE', 'Massive');
    const c = make('ALPHA_VANTAGE', 'Alpha Vantage');
    const router = new MarketDataRouter([a.adapter, b.adapter, c.adapter], { now: () => 0, failureThreshold: 99 });
    await router.getBars('EURUSD', 'DAILY', '5d');
    await router.getBars('EURUSD', 'DAILY', '5d');
    expect(order).toStrictEqual([
      'Twelve Data',
      'Massive',
      'Alpha Vantage',
      'Twelve Data',
      'Massive',
      'Alpha Vantage',
    ]);
  });
});

describe('MarketDataRouter — classified failures (no blanket fallback)', () => {
  it('aborts the whole chain on REQUEST_REJECTED instead of trying other providers', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond(() => fail('REQUEST_REJECTED', 'interval invalid'));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('VALIDATION_ERROR');
    if (result.status === 'SUCCESS') throw new Error('unreachable');
    expect(result.error.message).toContain('Twelve Data: interval invalid');
    expect(b.calls).toHaveLength(0);
    expect(router.getRouterState().outcome?.fulfillment).toBe('NONE');
  });

  it('skips UNSUPPORTED providers without a health penalty', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond(() => fail('UNSUPPORTED', 'weekly not served'));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('SUCCESS');
    const state = router.getRouterState();
    expect(state.providers[0].health).toBe('HEALTHY');
    expect(state.providers[0].consecutiveFailures).toBe(0);
    expect(state.providers[0].lastFailureKind).toBeUndefined();
  });

  it('records NOT_FOUND without opening the circuit', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond(() => fail('NOT_FOUND', 'no rows'));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0, failureThreshold: 1 });
    const first = await router.getBars('EURUSD', 'DAILY', '5d');
    const second = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(first.status).toBe('SUCCESS');
    expect(second.status).toBe('SUCCESS');
    expect(a.calls).toHaveLength(2); // never circuit-broken
    expect(router.getRouterState().providers[0]).toMatchObject({
      health: 'HEALTHY',
      lastFailureKind: 'NOT_FOUND',
      consecutiveFailures: 0,
    });
  });

  it('penalizes AUTH failures and falls through', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond(() => fail('AUTH', 'bad key'));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0, failureThreshold: 1 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('SUCCESS');
    const state = router.getRouterState();
    expect(state.providers[0].health).toBe('UNAVAILABLE'); // threshold 1 → circuit opened
    expect(state.providers[0].circuitOpenUntil).toBe(new Date(60_000).toISOString());
  });
});

describe('MarketDataRouter — circuit breaker and automatic recovery', () => {
  it('opens after the threshold, skips during cooldown, and recovers half-open', async () => {
    let nowMs = 0;
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond(() => fail('PROVIDER', 'down'));
    const router = new MarketDataRouter([a.adapter, b.adapter], {
      now: () => nowMs,
      failureThreshold: 2,
      cooldownMs: 60_000,
    });

    await router.getBars('EURUSD', 'DAILY', '5d'); // a failure 1 → DEGRADED, b serves
    expect(router.getRouterState().providers[0].health).toBe('DEGRADED');
    expect(router.getRouterState().outcome?.servedBy).toBe('Massive');
    await router.getBars('EURUSD', 'DAILY', '5d'); // a failure 2 → circuit open
    expect(router.getRouterState().providers[0].health).toBe('UNAVAILABLE');
    expect(a.calls).toHaveLength(2);

    // Within cooldown: primary skipped entirely (secondary still attempted).
    await router.getBars('EURUSD', 'DAILY', '5d');
    expect(a.calls).toHaveLength(2);
    expect(b.calls).toHaveLength(3);
    expect(router.getRouterState().providers[0].health).toBe('UNAVAILABLE');

    // Cooldown elapsed → half-open trial succeeds → HEALTHY again.
    nowMs = 60_001;
    a.setRespond((r) => ({ ok: true, dataset: makeDataset('TWELVE_DATA', 'Twelve Data', r) }));
    const recovered = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(recovered.status).toBe('SUCCESS');
    expect(a.calls).toHaveLength(3);
    const provider = router.getRouterState().providers[0];
    expect(provider.health).toBe('HEALTHY');
    expect(provider.consecutiveFailures).toBe(0);
    expect(provider.circuitOpenUntil).toBeUndefined();
    expect(router.getRouterState().outcome).toMatchObject({ servedBy: 'Twelve Data', usedFallback: false });
  });

  it('reports UNAVAILABLE (cooling down) when every enabled provider is circuit-open', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    a.setRespond(() => fail('PROVIDER'));
    const router = new MarketDataRouter([a.adapter], { now: () => 0, failureThreshold: 1, cooldownMs: 60_000 });
    await router.getBars('EURUSD', 'DAILY', '5d'); // opens the circuit
    const second = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(second.status).toBe('UNAVAILABLE');
    if (second.status === 'SUCCESS') throw new Error('unreachable');
    expect(second.error.message).toContain('cooling down');
    expect(a.calls).toHaveLength(1);
  });
});

describe('MarketDataRouter — cached last-valid snapshot (Phase 8)', () => {
  it('serves the last-valid snapshot when every provider fails, marked as CACHE', async () => {
    let nowMs = 0;
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const router = new MarketDataRouter([a.adapter], {
      now: () => nowMs,
      snapshotTtlMs: 300_000,
    });

    const fresh = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(fresh.status).toBe('SUCCESS');
    const original = timestamps(fresh);

    a.setRespond(() => fail('RATE_LIMITED'));
    nowMs = 10_000;
    const cached = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(timestamps(cached)).toStrictEqual(original);
    expect(router.getRouterState().outcome).toMatchObject({
      fulfillment: 'CACHE',
      servedBy: 'Twelve Data',
      retrievedAt: '2026-10-03T12:00:00.000Z',
      note: 'Using cached market data',
    });

    // Past the deterministic TTL the snapshot is refused, never served stale.
    nowMs = 300_001;
    const stale = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(stale.status).toBe('UNAVAILABLE');
    expect(router.getRouterState().outcome?.fulfillment).toBe('NONE');
  });

  it('keeps snapshot identity instrument/timeframe/range-scoped', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const router = new MarketDataRouter([a.adapter], { now: () => 0 });
    await router.getBars('EURUSD', 'DAILY', '5d');
    a.setRespond(() => fail('PROVIDER'));
    // Different range → different cache identity → no snapshot available.
    const other = await router.getBars('EURUSD', 'DAILY', '1y');
    expect(other.status).toBe('UNAVAILABLE');
    // Original range still served from its own snapshot.
    const original = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(original.status).toBe('SUCCESS');
  });

  it('never merges providers: a cached snapshot stays single-provider', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    await router.getBars('EURUSD', 'DAILY', '5d'); // Twelve Data snapshot
    // Every provider now fails: the served data must be the untouched
    // Twelve Data snapshot — never a blend with any other source.
    a.setRespond(() => fail('RATE_LIMITED'));
    b.setRespond(() => fail('PROVIDER'));
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(timestamps(result)).toStrictEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(router.getRouterState().outcome?.servedBy).toBe('Twelve Data');
  });
});

describe('MarketDataRouter — data integrity and the quality gate (Phase 7)', () => {
  it('rejects a provider dataset that fails the quality gate and falls through', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond((r) => ({
      ok: true,
      dataset: makeDataset('TWELVE_DATA', 'Twelve Data', r, {
        dates: ['2026-10-01', '2026-10-01', '2026-10-02'], // duplicate timestamp
      }),
    }));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('SUCCESS');
    // Served bars are exactly the secondary's dataset — nothing mixed, nothing repaired.
    expect(timestamps(result)).toStrictEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(router.getRouterState().providers[0]).toMatchObject({
      health: 'DEGRADED',
      lastFailureKind: 'INVALID_DATA',
    });
  });

  it('rejects rows for the wrong instrument (expected-instrument enforcement)', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    a.setRespond((r) => ({
      ok: true,
      dataset: makeDataset('TWELVE_DATA', 'Twelve Data', r, { instrument: 'GBPUSD' }),
    }));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('SUCCESS');
    expect(result.status === 'SUCCESS' && result.value.every((bar) => bar.instrument === 'EURUSD')).toBe(true);
    expect(router.getRouterState().providers[0].lastFailureKind).toBe('INVALID_DATA');
  });

  it('rejects malformed OHLC through the gate before serving', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    a.setRespond((r) => {
      const dataset = makeDataset('TWELVE_DATA', 'Twelve Data', r);
      const broken: MarketBar[] = dataset.bars.map((bar, i) =>
        i === 1 ? { ...bar, high: bar.low - 0.1 } : bar,
      );
      return { ok: true, dataset: { ...dataset, bars: broken } };
    });
    const router = new MarketDataRouter([a.adapter], { now: () => 0 });
    const result = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('VALIDATION_ERROR'); // gate failure with no fallback left
    expect(router.getRouterState().outcome?.fulfillment).toBe('NONE');
  });
});

describe('MarketDataRouter — candle-boundary switch detection (Phase 6)', () => {
  it('reports a boundary mismatch warning when the serving provider changes', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    b.setRespond((r) => ({
      ok: true,
      dataset: makeDataset('MASSIVE', 'Massive', r, {
        boundary: {
          providerStatement: 'Massive daily windows begin at midnight Eastern, quote-based.',
          sourceTimezone: 'UTC',
          confidence: 'DOCUMENTED',
        },
      }),
    }));
    const router = new MarketDataRouter([a.adapter, b.adapter], { now: () => 0 });

    const first = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(first.status).toBe('SUCCESS');
    expect(router.getRouterState().outcome?.boundaryWarning).toBeUndefined();

    a.setRespond(() => fail('RATE_LIMITED'));
    const second = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(second.status).toBe('SUCCESS');
    const warning = router.getRouterState().outcome?.boundaryWarning;
    expect(warning).toBeDefined();
    expect(warning).toContain('Candle-boundary mismatch detected');
    expect(warning).toContain('must never be mixed');
    expect(warning).toContain('preserved verbatim');
  });
});

describe('MarketDataRouter — service-level status and provenance mapping (Phases 9/11)', () => {
  it('maps router outcomes onto honest DataSourceMetadata states', async () => {
    let nowMs = 0;
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const b = fakeAdapter('MASSIVE', 'Massive');
    const router = new MarketDataRouter([a.adapter, b.adapter], {
      now: () => nowMs,
      snapshotTtlMs: 300_000,
    });
    const service = new MarketDataServiceImpl(router);

    // Before the first request: configured, but nothing claimed as live yet.
    const initial = await service.getDataSourceStatus();
    expect(initial).toMatchObject({
      status: 'SUCCESS',
      value: { status: 'AVAILABLE', mode: 'LIVE', note: 'Provider configured — awaiting first data request' },
    });

    // Primary live.
    await router.getBars('EURUSD', 'DAILY', '5d');
    const live = await service.getDataSourceStatus();
    expect(live).toMatchObject({
      status: 'SUCCESS',
      value: { status: 'AVAILABLE', mode: 'LIVE', sourceLabel: 'Twelve Data', note: 'Live — Twelve Data' },
    });

    // Fallback live → DEGRADED with the fallback label.
    a.setRespond(() => fail('RATE_LIMITED'));
    await router.getBars('EURUSD', 'DAILY', '5d');
    const fallback = await service.getDataSourceStatus();
    expect(fallback).toMatchObject({
      status: 'SUCCESS',
      value: { status: 'DEGRADED', mode: 'LIVE', sourceLabel: 'Massive', note: 'Live — Massive fallback' },
    });

    // All failed → cached snapshot → DEGRADED "Using cached market data".
    b.setRespond(() => fail('PROVIDER'));
    await router.getBars('EURUSD', 'DAILY', '5d');
    const cached = await service.getDataSourceStatus();
    expect(cached).toMatchObject({
      status: 'SUCCESS',
      value: { status: 'DEGRADED', mode: 'LIVE', sourceLabel: 'Massive', note: 'Using cached market data' },
    });

    // Snapshot expired → all providers still failing → UNAVAILABLE.
    nowMs = 400_000;
    const expired = await router.getBars('EURUSD', 'DAILY', '5d');
    expect(expired.status).toBe('UNAVAILABLE');
    const goneStatus = await service.getDataSourceStatus();
    expect(goneStatus.status).toBe('UNAVAILABLE');
  });

  it('stamps analysis provenance with the serving provider and retrieval clock', async () => {
    const dates = Array.from({ length: 80 }, (_, i) =>
      new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10),
    );
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    a.setRespond((request) => ({
      ok: true,
      dataset: makeDataset('TWELVE_DATA', 'Twelve Data', request, { dates }),
    }));
    const router = new MarketDataRouter([a.adapter], { now: () => 0 });
    const analysis = new AnalysisServiceImpl(new MarketDataServiceImpl(router));

    const result = await analysis.analyze({ instrument: 'EURUSD', timeframe: 'DAILY' });
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;

    const provenance = result.value.dataProvenance;
    expect(provenance).toMatchObject({
      sourceType: 'MARKET_DATA_PROVIDER',
      sourceName: 'Twelve Data',
      methodology: 'app market-data service (quality-gated)',
      acquiredAt: '2026-10-03T12:00:00.000Z',
    });
    expect(provenance.notes).toContain('bars: 80');
    expect(provenance.notes).toContain('source: Live — Twelve Data');
  });

  it('reports NOT_CONFIGURED when the router has no enabled providers', async () => {
    const router = createDefaultMarketDataRouter();
    const service = new MarketDataServiceImpl(router);
    const status = await service.getDataSourceStatus();
    expect(status).toMatchObject({
      status: 'SUCCESS',
      value: { status: 'NOT_CONFIGURED', mode: 'UNKNOWN' },
    });
    const bars = await service.getHistoricalBars('EURUSD', 'DAILY', '5d');
    expect(bars.status).toBe('NOT_CONFIGURED');
    const snapshot = await service.getLatestSnapshot('EURUSD');
    expect(snapshot.status).toBe('NOT_CONFIGURED');
  });

  it('stamps snapshot provenance with the serving provider, retrieval clock and cache honesty', async () => {
    const a = fakeAdapter('TWELVE_DATA', 'Twelve Data');
    const router = new MarketDataRouter([a.adapter], { now: () => 0 });
    const service = new MarketDataServiceImpl(router);

    const live = await service.getLatestSnapshot('EURUSD');
    expect(live.status).toBe('SUCCESS');
    if (live.status !== 'SUCCESS') throw new Error('unreachable');
    expect(live.value.provenance).toMatchObject({ sourceName: 'Twelve Data' });
    expect(live.value.receivedAt).toBe('2026-10-03T12:00:00.000Z');

    a.setRespond(() => fail('PROVIDER'));
    const cached = await service.getLatestSnapshot('EURUSD');
    expect(cached.status).toBe('SUCCESS');
    if (cached.status !== 'SUCCESS') throw new Error('unreachable');
    expect(cached.value.provenance).toMatchObject({
      sourceName: 'Twelve Data',
      notes: 'Using cached market data — not a live quote.',
    });
  });

  it('the default adapter set is fully disabled until a server boundary exists', () => {
    const adapters = createDefaultAdapters();
    expect(adapters.map((x) => [x.id, x.verification, x.isEnabled()])).toStrictEqual([
      ['TWELVE_DATA', 'VERIFIED', false],
      ['MASSIVE', 'VERIFIED', false],
      ['ALPHA_VANTAGE', 'UNVERIFIED', false],
    ]);
  });
});
