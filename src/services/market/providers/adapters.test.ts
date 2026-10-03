/**
 * Provider adapter matrix (32T Phase 10).
 *
 * Every adapter is exercised through its transport seam with fixtures
 * transcribed from the providers' documented response shapes (Twelve Data
 * fixtures mirror a live 2026-10-03 demo-key probe). No network access.
 *
 * The security contract runs through the whole file: each adapter is built
 * with a sentinel credential and every surfaced failure must be free of it.
 */
import { describe, expect, it } from 'vitest';

import type { Timeframe } from '@/domain/market/timeframe';
import { ProviderTransportError } from './transport';
import { TwelveDataAdapter } from './twelveData';
import { MassiveAdapter, easternDate } from './massive';
import { AlphaVantageAdapter } from './alphaVantage';
import type {
  ProviderAdapterResult,
  ProviderHttpRequest,
  ProviderHttpResponse,
  ProviderTransport,
} from './types';

const KEY = 'SENTINEL_KEY_9f8e7d6c5b4a';

function recorder(handler: (req: ProviderHttpRequest) => ProviderHttpResponse): {
  calls: ProviderHttpRequest[];
  transport: ProviderTransport;
} {
  const calls: ProviderHttpRequest[] = [];
  const transport: ProviderTransport = async (req) => {
    calls.push(req);
    return handler(req);
  };
  return { calls, transport };
}

function json(body: unknown, status = 200): ProviderHttpResponse {
  return { status, body: typeof body === 'string' ? body : JSON.stringify(body) };
}

async function expectFailure(result: ProviderAdapterResult, kind: string): Promise<string> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('unreachable');
  expect(result.failure.kind).toBe(kind);
  // Security contract: the credential never surfaces in a failure message.
  expect(result.failure.message).not.toContain(KEY);
  return result.failure.message;
}

// ---------------------------------------------------------------------------
// Twelve Data — fixtures mirror the live demo-key probe (2026-10-03)
// ---------------------------------------------------------------------------

const TD_LIVE_SHAPE = {
  meta: {
    symbol: 'EUR/USD',
    interval: '1day',
    currency_base: 'Euro',
    currency_quote: 'US Dollar',
    type: 'Physical Currency',
  },
  values: [
    { datetime: '2026-10-03', open: '1.12514', high: '1.12619', low: '1.12514', close: '1.12587' },
    { datetime: '2026-10-02', open: '1.1242', high: '1.12861', low: '1.12218', close: '1.12521' },
    { datetime: '2026-10-01', open: '1.13298', high: '1.1337', low: '1.12159', close: '1.12428' },
  ],
  status: 'ok',
};

function tdAdapter(transport: ProviderTransport, apiKey: string | null = KEY): TwelveDataAdapter {
  return new TwelveDataAdapter({
    apiKey,
    transport,
    now: () => '2026-10-03T12:00:00.000Z',
  });
}

const req = { instrument: 'EURUSD', timeframe: 'DAILY' as Timeframe, range: '5d' };

describe('Twelve Data adapter', () => {
  it('is disabled without a server-side credential and never calls the transport', async () => {
    const { calls, transport } = recorder(() => json(TD_LIVE_SHAPE));
    const adapter = tdAdapter(transport, null);
    expect(adapter.isEnabled()).toBe(false);
    await expectFailure(await adapter.getBars(req), 'CONFIGURATION');
    expect(calls).toHaveLength(0);
  });

  it('normalizes a live-shaped response into a provider-neutral dataset', async () => {
    const { transport } = recorder(() => json(TD_LIVE_SHAPE));
    const result = await tdAdapter(transport).getBars(req);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const ds = result.dataset;
    expect(ds.providerId).toBe('TWELVE_DATA');
    expect(ds.providerLabel).toBe('Twelve Data');
    expect(ds.instrument).toBe('EURUSD');
    expect(ds.timeframe).toBe('DAILY');
    expect(ds.retrievedAt).toBe('2026-10-03T12:00:00.000Z');
    expect(ds.candleBoundary.confidence).toBe('AMBIGUOUS');
    expect(ds.sourceMeta.reportedSymbol).toBe('EUR/USD');
    expect(ds.sourceMeta.reportedTimeframe).toBe('1day');
    // chronological ascending, verbatim timestamps (weekend stamp preserved)
    expect(ds.bars.map((b) => b.timestamp)).toStrictEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(ds.bars[0]).toStrictEqual({
      instrument: 'EURUSD',
      timeframe: 'DAILY',
      timestamp: '2026-10-01',
      open: 1.13298,
      high: 1.1337,
      low: 1.12159,
      close: 1.12428,
    });
    expect(ds.bars[2].timestamp).toBe('2026-10-03'); // Saturday stamp: preserved, never re-stamped
  });

  it('builds the documented request with header auth and no key in the URL', async () => {
    const { calls, transport } = recorder(() => json(TD_LIVE_SHAPE));
    await tdAdapter(transport).getBars(req);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toContain('https://api.twelvedata.com/time_series');
    expect(call.url).toContain('symbol=EUR%2FUSD');
    expect(call.url).toContain('interval=1day');
    expect(call.url).toContain('outputsize=5');
    expect(call.url).not.toContain(KEY);
    expect(call.headers.Authorization).toBe(`apikey ${KEY}`);
  });

  it('maps WEEKLY to interval=1week with a week-based outputsize', async () => {
    const { calls, transport } = recorder(() => json({ ...TD_LIVE_SHAPE, meta: { ...TD_LIVE_SHAPE.meta, interval: '1week' } }));
    await tdAdapter(transport).getBars({ instrument: 'EURUSD', timeframe: 'WEEKLY', range: '4w' });
    expect(calls[0].url).toContain('interval=1week');
    expect(calls[0].url).toContain('outputsize=4');
  });

  it('rejects an unsupported timeframe and an invalid range without a transport call', async () => {
    const { calls, transport } = recorder(() => json(TD_LIVE_SHAPE));
    const adapter = tdAdapter(transport);
    await expectFailure(await adapter.getBars({ instrument: 'EURUSD', timeframe: 'H1' as Timeframe, range: '5d' }), 'UNSUPPORTED');
    await expectFailure(await adapter.getBars({ instrument: 'EURUSD', timeframe: 'DAILY', range: '2h' }), 'REQUEST_REJECTED');
    expect(calls).toHaveLength(0);
  });

  it('classifies malformed and missing payloads', async () => {
    const adapter = tdAdapter(recorder(() => json('not json {')).transport);
    await expectFailure(await adapter.getBars(req), 'MALFORMED');
    const noValues = tdAdapter(recorder(() => json({ meta: TD_LIVE_SHAPE.meta, status: 'ok' })).transport);
    await expectFailure(await noValues.getBars(req), 'MALFORMED');
    const noStatus = tdAdapter(recorder(() => json({ meta: TD_LIVE_SHAPE.meta, values: [] })).transport);
    await expectFailure(await noStatus.getBars(req), 'MALFORMED');
  });

  it('rejects invalid OHLC instead of repairing it', async () => {
    const missingClose = {
      ...TD_LIVE_SHAPE,
      values: [{ datetime: '2026-10-02', open: '1.1', high: '1.2', low: '1.0' }, ...TD_LIVE_SHAPE.values],
    };
    await expectFailure(
      await tdAdapter(recorder(() => json(missingClose)).transport).getBars(req),
      'INVALID_DATA',
    );
    const broken = {
      ...TD_LIVE_SHAPE,
      values: [{ datetime: '2026-10-02', open: '1.1', high: '1.0', low: '1.2', close: '1.1' }, ...TD_LIVE_SHAPE.values],
    };
    await expectFailure(
      await tdAdapter(recorder(() => json(broken)).transport).getBars(req),
      'INVALID_DATA',
    );
    const nan = {
      ...TD_LIVE_SHAPE,
      values: [{ datetime: '2026-10-02', open: 'NaNish', high: '1.0', low: '0.9', close: '1.1' }, ...TD_LIVE_SHAPE.values],
    };
    await expectFailure(await tdAdapter(recorder(() => json(nan)).transport).getBars(req), 'INVALID_DATA');
  });

  it('rejects duplicate timestamps', async () => {
    const dupes = { ...TD_LIVE_SHAPE, values: [TD_LIVE_SHAPE.values[0], ...TD_LIVE_SHAPE.values] };
    await expectFailure(await tdAdapter(recorder(() => json(dupes)).transport).getBars(req), 'INVALID_DATA');
  });

  it('detects instrument and timeframe mismatches in meta', async () => {
    const wrongSymbol = { ...TD_LIVE_SHAPE, meta: { ...TD_LIVE_SHAPE.meta, symbol: 'GBP/USD' } };
    await expectFailure(await tdAdapter(recorder(() => json(wrongSymbol)).transport).getBars(req), 'CONTRACT_MISMATCH');
    const wrongInterval = { ...TD_LIVE_SHAPE, meta: { ...TD_LIVE_SHAPE.meta, interval: '1week' } };
    await expectFailure(await tdAdapter(recorder(() => json(wrongInterval)).transport).getBars(req), 'CONTRACT_MISMATCH');
  });

  it('returns NOT_FOUND for an empty dataset', async () => {
    const empty = { ...TD_LIVE_SHAPE, values: [] };
    await expectFailure(await tdAdapter(recorder(() => json(empty)).transport).getBars(req), 'NOT_FOUND');
  });

  it('classifies documented HTTP error statuses', async () => {
    const cases: Array<[number, string]> = [
      [401, 'AUTH'],
      [403, 'AUTH'],
      [429, 'RATE_LIMITED'],
      [400, 'REQUEST_REJECTED'],
      [404, 'NOT_FOUND'],
      [500, 'PROVIDER'],
    ];
    for (const [status, kind] of cases) {
      const adapter = tdAdapter(recorder(() => json({ code: status, message: `err ${status}`, status: 'error' }, status)).transport);
      await expectFailure(await adapter.getBars(req), kind);
    }
  });

  it('classifies documented error bodies returned with HTTP 200', async () => {
    const body = { code: 429, message: 'API rate limit reached', status: 'error' };
    const adapter = tdAdapter(recorder(() => json(body)).transport);
    await expectFailure(await adapter.getBars(req), 'RATE_LIMITED');
    const badParam = { code: 400, message: 'Invalid **interval** provided', status: 'error' };
    const adapter2 = tdAdapter(recorder(() => json(badParam)).transport);
    await expectFailure(await adapter2.getBars(req), 'REQUEST_REJECTED');
  });

  it('classifies timeout and network failures from the transport', async () => {
    const timeout: ProviderTransport = async () => {
      throw new ProviderTransportError('TIMEOUT', 'provider request timed out');
    };
    await expectFailure(await tdAdapter(timeout).getBars(req), 'TIMEOUT');
    const network: ProviderTransport = async () => {
      throw new ProviderTransportError('NETWORK', 'network error while contacting the provider');
    };
    await expectFailure(await tdAdapter(network).getBars(req), 'NETWORK');
  });

  it('redacts the credential from provider-supplied error text', async () => {
    const leaky = json(
      { code: 400, message: `bad url https://api.twelvedata.com/x?apikey=${KEY}`, status: 'error' },
      400,
    );
    const adapter = tdAdapter(recorder(() => leaky).transport);
    const message = await expectFailure(await adapter.getBars(req), 'REQUEST_REJECTED');
    expect(message).toContain('[redacted]');
  });

  it('captures the exchange timezone when the provider states one', async () => {
    const withTz = { ...TD_LIVE_SHAPE, meta: { ...TD_LIVE_SHAPE.meta, exchange_timezone: 'UTC' } };
    const result = await tdAdapter(recorder(() => json(withTz)).transport).getBars(req);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.dataset.candleBoundary.sourceTimezone).toBe('UTC');
  });
});

// ---------------------------------------------------------------------------
// Massive — fixtures from the official docs (custom-bars.md sample + envelope)
// ---------------------------------------------------------------------------

const MV_SAMPLE = {
  adjusted: true,
  queryCount: 3,
  request_id: '79c061995d8b627b736170bc9653f15d',
  results: [
    { c: 1.17721, h: 1.18305, l: 1.1756, n: 125329, o: 1.17921, t: 1626912000000, v: 125329, vw: 1.1789 },
    { c: 1.17601, h: 1.17905, l: 1.1746, n: 100000, o: 1.17821, t: 1626998400000, v: 100000, vw: 1.177 },
  ],
  resultsCount: 2,
  status: 'OK',
  ticker: 'C:EURUSD',
};

function mvAdapter(transport: ProviderTransport, apiKey: string | null = KEY): MassiveAdapter {
  return new MassiveAdapter({
    apiKey,
    transport,
    now: () => Date.UTC(2026, 9, 3, 12, 0, 0), // 2026-10-03 08:00 Eastern
  });
}

describe('Massive adapter', () => {
  it('is disabled without a server-side credential and never calls the transport', async () => {
    const { calls, transport } = recorder(() => json(MV_SAMPLE));
    const adapter = mvAdapter(transport, null);
    expect(adapter.isEnabled()).toBe(false);
    await expectFailure(await adapter.getBars(req), 'CONFIGURATION');
    expect(calls).toHaveLength(0);
  });

  it('builds the documented path with bearer auth and Eastern date bounds', async () => {
    const { calls, transport } = recorder(() => json(MV_SAMPLE));
    await mvAdapter(transport).getBars(req);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toContain('https://api.massive.com/v2/aggs/ticker/C:EURUSD/range/1/day/2026-09-28/2026-10-03');
    expect(call.url).toContain('sort=asc');
    expect(call.url).not.toContain(KEY);
    expect(call.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it('maps WEEKLY to the week timespan', async () => {
    const { calls, transport } = recorder(() => json(MV_SAMPLE));
    await mvAdapter(transport).getBars({ instrument: 'EURUSD', timeframe: 'WEEKLY', range: '4w' });
    expect(calls[0].url).toContain('/range/1/week/');
  });

  it('derives bar dates as the Eastern calendar date of the window start', async () => {
    const result = await mvAdapter(recorder(() => json(MV_SAMPLE)).transport).getBars(req);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    // 1626912000000 = 2021-07-22T00:00:00Z = 2021-07-21 20:00 EDT → Eastern
    // calendar date 2021-07-21 (UTC-midnight anchor ambiguity documented).
    expect(result.dataset.bars.map((b) => b.timestamp)).toStrictEqual(['2021-07-21', '2021-07-22']);
    expect(result.dataset.candleBoundary.sourceTimezone).toBe('America/New_York');
    expect(result.dataset.candleBoundary.confidence).toBe('AMBIGUOUS');
    expect(easternDate(Date.UTC(2021, 6, 21, 4, 0, 0))).toBe('2021-07-21'); // midnight-EDT window start
  });

  it('classifies documented HTTP error statuses', async () => {
    const cases: Array<[number, string]> = [
      [401, 'AUTH'],
      [403, 'AUTH'],
      [429, 'RATE_LIMITED'],
      [400, 'REQUEST_REJECTED'],
      [404, 'NOT_FOUND'],
      [503, 'PROVIDER'],
    ];
    for (const [status, kind] of cases) {
      const adapter = mvAdapter(recorder(() => json({ status: 'ERROR', error: 'x' }, status)).transport);
      await expectFailure(await adapter.getBars(req), kind);
    }
  });

  it('classifies a documented rate-limit error body (HTTP 200)', async () => {
    const body = { status: 'ERROR', error: "You've exceeded the rate limit for this API" };
    await expectFailure(await mvAdapter(recorder(() => json(body)).transport).getBars(req), 'RATE_LIMITED');
    const authBody = { status: 'ERROR', error: 'invalid api key provided' };
    await expectFailure(await mvAdapter(recorder(() => json(authBody)).transport).getBars(req), 'AUTH');
    const other = { status: 'ERROR', error: 'internal boom' };
    await expectFailure(await mvAdapter(recorder(() => json(other)).transport).getBars(req), 'PROVIDER');
  });

  it('rejects ticker mismatches, malformed bodies and empty results', async () => {
    const wrongTicker = { ...MV_SAMPLE, ticker: 'C:GBPUSD' };
    await expectFailure(await mvAdapter(recorder(() => json(wrongTicker)).transport).getBars(req), 'CONTRACT_MISMATCH');
    await expectFailure(await mvAdapter(recorder(() => json('oops')).transport).getBars(req), 'MALFORMED');
    const noResults = { ...MV_SAMPLE, results: [] };
    await expectFailure(await mvAdapter(recorder(() => json(noResults)).transport).getBars(req), 'NOT_FOUND');
  });

  it('rejects invalid OHLC and duplicate window dates', async () => {
    const broken = { ...MV_SAMPLE, results: [{ t: 1626912000000, o: 'x', h: 1, l: 0.5, c: 0.9 }, ...MV_SAMPLE.results] };
    await expectFailure(await mvAdapter(recorder(() => json(broken)).transport).getBars(req), 'INVALID_DATA');
    // Two windows landing on the same Eastern date → duplicate after normalization
    const sameDay = {
      ...MV_SAMPLE,
      results: [
        { t: Date.UTC(2021, 6, 21, 4, 0, 0), o: 1, h: 2, l: 0.5, c: 1.5 },
        { t: Date.UTC(2021, 6, 21, 6, 0, 0), o: 1, h: 2, l: 0.5, c: 1.5 },
      ],
    };
    await expectFailure(await mvAdapter(recorder(() => json(sameDay)).transport).getBars(req), 'INVALID_DATA');
  });

  it('classifies timeout and network failures', async () => {
    const timeout: ProviderTransport = async () => {
      throw new ProviderTransportError('TIMEOUT', 'provider request timed out');
    };
    await expectFailure(await mvAdapter(timeout).getBars(req), 'TIMEOUT');
    const network: ProviderTransport = async () => {
      throw new ProviderTransportError('NETWORK', 'network error while contacting the provider');
    };
    await expectFailure(await mvAdapter(network).getBars(req), 'NETWORK');
  });

  it('redacts the credential from provider-supplied error text', async () => {
    const leaky = json({ status: 'ERROR', error: `rejected for key ${KEY}` });
    const message = await expectFailure(await mvAdapter(recorder(() => leaky).transport).getBars(req), 'PROVIDER');
    expect(message).toContain('[redacted]');
  });
});

// ---------------------------------------------------------------------------
// Alpha Vantage — UNVERIFIED: hard-disabled in production, parser pinned only
// by tests that temporarily force the verification flag on an instance.
// ---------------------------------------------------------------------------

const AV_SERIES = {
  'Meta Data': {
    '1. Information': 'Forex Daily Prices',
    '2. From Symbol': 'EUR',
    '3. To Symbol': 'USD',
    '4. Last Refreshed': '2026-10-02',
    '5. Time Zone': 'UTC',
  },
  'Time Series FX (Daily)': {
    '2026-10-02': { '1. open': '1.1242', '2. high': '1.12861', '3. low': '1.12218', '4. close': '1.12521' },
    '2026-10-01': { '1. open': '1.13298', '2. high': '1.1337', '3. low': '1.12159', '4. close': '1.12428' },
  },
};

function avAdapter(transport: ProviderTransport, options: { forceVerified?: boolean; apiKey?: string | null } = {}): AlphaVantageAdapter {
  const adapter = new AlphaVantageAdapter({
    apiKey: options.apiKey === undefined ? KEY : options.apiKey,
    transport,
    now: () => '2026-10-03T12:00:00.000Z',
  });
  if (options.forceVerified) {
    // Test-only: lift the UNVERIFIED gate to pin the parser's behavior.
    Object.defineProperty(adapter, 'verification', { value: 'VERIFIED' });
  }
  return adapter;
}

describe('Alpha Vantage adapter', () => {
  it('stays hard-disabled while UNVERIFIED, even with a credential', async () => {
    const { calls, transport } = recorder(() => json(AV_SERIES));
    const adapter = avAdapter(transport);
    expect(adapter.verification).toBe('UNVERIFIED');
    expect(adapter.isEnabled()).toBe(false);
    await expectFailure(await adapter.getBars(req), 'CONFIGURATION');
    expect(calls).toHaveLength(0);
  });

  it('parses the expected FX_DAILY shape when force-verified by a test', async () => {
    const { calls, transport } = recorder(() => json(AV_SERIES));
    const result = await avAdapter(transport, { forceVerified: true }).getBars(req);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.dataset.providerLabel).toBe('Alpha Vantage');
    expect(result.dataset.bars.map((b) => b.timestamp)).toStrictEqual(['2026-10-01', '2026-10-02']);
    expect(result.dataset.bars[1].close).toBe(1.12521);
    expect(result.dataset.candleBoundary.sourceTimezone).toBe('UTC');
    const call = calls[0];
    expect(call.url).toContain('function=FX_DAILY');
    expect(call.url).toContain('from_symbol=EUR');
    expect(call.url).toContain('to_symbol=USD');
    expect(call.url).toContain('outputsize=compact');
    expect(call.url).toContain(`apikey=${KEY}`); // documented query-param auth
    expect(call.headers.Authorization).toBeUndefined();
  });

  it('supports DAILY only while unverified', async () => {
    const adapter = avAdapter(recorder(() => json(AV_SERIES)).transport, { forceVerified: true });
    await expectFailure(await adapter.getBars({ instrument: 'EURUSD', timeframe: 'WEEKLY', range: '4w' }), 'UNSUPPORTED');
  });

  it('rejects symbol mismatches against the response meta', async () => {
    const wrong = {
      ...AV_SERIES,
      'Meta Data': { ...AV_SERIES['Meta Data'], '2. From Symbol': 'GBP' },
    };
    await expectFailure(
      await avAdapter(recorder(() => json(wrong)).transport, { forceVerified: true }).getBars(req),
      'CONTRACT_MISMATCH',
    );
  });

  it('classifies bodies without a series by documented message keys', async () => {
    const rate = { Information: 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day' };
    await expectFailure(
      await avAdapter(recorder(() => json(rate)).transport, { forceVerified: true }).getBars(req),
      'RATE_LIMITED',
    );
    const demo = { Information: 'The **demo** API key is for demo purposes only.' };
    await expectFailure(
      await avAdapter(recorder(() => json(demo)).transport, { forceVerified: true }).getBars(req),
      'AUTH',
    );
    const invalid = { 'Error Message': 'Invalid API call. Please retry or visit the API explorer.' };
    await expectFailure(
      await avAdapter(recorder(() => json(invalid)).transport, { forceVerified: true }).getBars(req),
      'REQUEST_REJECTED',
    );
    await expectFailure(
      await avAdapter(recorder(() => json({ nothing: true })).transport, { forceVerified: true }).getBars(req),
      'MALFORMED',
    );
  });

  it('rejects malformed rows and non-daily date keys', async () => {
    const missing = {
      ...AV_SERIES,
      'Time Series FX (Daily)': { '2026-10-02': { '1. open': '1.1', '2. high': '1.2' } },
    };
    await expectFailure(
      await avAdapter(recorder(() => json(missing)).transport, { forceVerified: true }).getBars(req),
      'INVALID_DATA',
    );
    const badKey = { ...AV_SERIES, 'Time Series FX (Daily)': { '2026-10-02 15:00': AV_SERIES['Time Series FX (Daily)']['2026-10-02'] } };
    await expectFailure(
      await avAdapter(recorder(() => json(badKey)).transport, { forceVerified: true }).getBars(req),
      'MALFORMED',
    );
  });

  it('classifies HTTP statuses and never leaks the key', async () => {
    const statuses: Array<[number, string]> = [[429, 'RATE_LIMITED'], [401, 'AUTH'], [400, 'REQUEST_REJECTED'], [500, 'PROVIDER']];
    for (const [status, kind] of statuses) {
      const adapter = avAdapter(recorder(() => json({ 'Error Message': `bad ${status} ${KEY}` }, status)).transport, {
        forceVerified: true,
      });
      await expectFailure(await adapter.getBars(req), kind);
    }
  });
});
