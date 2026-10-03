/**
 * Market-data security + bundle isolation tests (32T Phase 4/10).
 *
 * Two layers:
 * 1. SOURCE RULES — market-data modules must never touch browser storage,
 *    console logging, or build-time env, and provider adapters must not read
 *    process env indirection; the app composition root, hooks and pages must
 *    never import the provider folder or the router, so provider code and
 *    any future credential path stay out of the client bundle entirely.
 * 2. BEHAVIORAL RULES — driven with a sentinel credential through the real
 *    adapter + router + service stack: the key must never appear in results,
 *    failures, router state or data-source metadata.
 *
 * Uses Vite's raw-import glob (no filesystem access — the repo-wide guard
 * bans file-reading functions in app source).
 */
import { describe, expect, it } from 'vitest';

import { MarketDataServiceImpl } from '@/services/market';
import { MarketDataRouter } from '@/services/market/router';
import { TwelveDataAdapter } from './providers/twelveData';
import { MassiveAdapter } from './providers/massive';
import { AlphaVantageAdapter } from './providers/alphaVantage';
import type { ProviderHttpRequest, ProviderHttpResponse } from './providers/types';

const KEY = 'SENTINEL_KEY_z8y7x6w5v4u3';

const MARKET_SOURCES = import.meta.glob<string>(['./**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const COMPOSITION_SOURCES = import.meta.glob<string>(
  ['../app.tsx', '../../hooks/*.ts', '../../pages/*.tsx'],
  { query: '?raw', import: 'default', eager: true },
);

function entries(sources: Record<string, string>, filter?: (path: string) => boolean): Array<[string, string]> {
  return Object.entries(sources).filter(([path]) => (filter ? filter(path) : true));
}

describe('market-data source rules', () => {
  it('market modules never touch browser storage, cookies, console or build-time env', () => {
    const production = entries(MARKET_SOURCES, (path) => !path.includes('.test.'));
    expect(production.length).toBeGreaterThan(5);
    for (const [path, src] of production) {
      expect(src, `${path} must not use browser storage`).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
      expect(src, `${path} must not log to console`).not.toMatch(/console\.(log|warn|error|info|debug)/);
      expect(src, `${path} must not read build-time env`).not.toMatch(/import\.meta\.env/);
    }
  });

  it('provider adapters never read environment variables (credentials are constructor-injected only)', () => {
    // The quarantined CurrencyFreaks adapter is the documented exception:
    // it is pre-existing, incomplete, UNVERIFIED work kept outside every
    // import graph (bundle isolation is asserted by the composition test).
    // The three architecture adapters must be strictly constructor-injected.
    const providers = entries(
      MARKET_SOURCES,
      (path) =>
        path.includes('providers/') &&
        !path.includes('.test.') &&
        !path.includes('currencyfreaks'),
    );
    expect(providers.length).toBeGreaterThanOrEqual(4);
    for (const [path, src] of providers) {
      expect(src, `${path} must not read process env`).not.toMatch(/process[.]env/);
      expect(src, `${path} must not embed placeholder credentials`).not.toMatch(/apiKey\s*=\s*['"][^'"]+['"]/);
    }
    // And no module may import the quarantined adapter.
    for (const [path, src] of entries(MARKET_SOURCES)) {
      if (path.includes('currencyfreaks')) continue;
      expect(src, `${path} imports the quarantined adapter`).not.toMatch(
        /from\s+["'][^"']*currencyfreaks["']/,
      );
    }
  });

  it('the client composition root, hooks and pages never import the router or provider adapters', () => {
    const composition = entries(COMPOSITION_SOURCES);
    expect(composition.length).toBeGreaterThan(5);
    for (const [path, src] of composition) {
      expect(src, `${path} must not import the provider folder`).not.toMatch(
        /@\/services\/market\/providers/,
      );
      expect(src, `${path} must not import the router`).not.toMatch(/@\/services\/market\/router/);
      expect(src, `${path} must not reference API keys`).not.toMatch(/API_KEY|apikey=/i);
    }
  });

  it('the app composition root keeps the honest unconfigured market-data service (checkpoint)', () => {
    const appSource = COMPOSITION_SOURCES['../app.tsx'] ?? '';
    expect(appSource).toContain('UnconfiguredMarketDataService');
    expect(appSource).not.toContain('MarketDataRouter');
    expect(appSource).not.toContain('TwelveDataAdapter');
  });
});

function json(body: unknown, status = 200): ProviderHttpResponse {
  return { status, body: JSON.stringify(body) };
}

const TD_BODY = {
  meta: { symbol: 'EUR/USD', interval: '1day', type: 'Physical Currency' },
  values: [{ datetime: '2026-10-02', open: '1.1', high: '1.2', low: '1.0', close: '1.15' }],
  status: 'ok',
};

describe('credential leakage is impossible through the service surface', () => {
  it('real adapters with a sentinel key never surface it in failures or state', async () => {
    // Success path: the key was used in the Authorization header only.
    const okTransport = async (): Promise<ProviderHttpResponse> => json(TD_BODY);
    const td = new TwelveDataAdapter({ apiKey: KEY, transport: okTransport });
    const tdResult = await td.getBars({ instrument: 'EURUSD', timeframe: 'DAILY', range: '5d' });
    expect(JSON.stringify(tdResult)).not.toContain(KEY);

    // Failure paths: HTTP errors and leaky provider messages.
    const leaky = json({ code: 400, message: `echo ${KEY}`, status: 'error' }, 400);
    const tdFail = new TwelveDataAdapter({
      apiKey: KEY,
      transport: async () => leaky,
    });
    const failure = await tdFail.getBars({ instrument: 'EURUSD', timeframe: 'DAILY', range: '5d' });
    expect(JSON.stringify(failure)).not.toContain(KEY);

    const mv = new MassiveAdapter({
      apiKey: KEY,
      transport: async () => json({ status: 'ERROR', error: `leak ${KEY}` }),
    });
    expect(JSON.stringify(await mv.getBars({ instrument: 'EURUSD', timeframe: 'DAILY', range: '5d' }))).not.toContain(KEY);

    const av = new AlphaVantageAdapter({
      apiKey: KEY,
      transport: async () => json({ 'Error Message': `bad ${KEY}` }),
    });
    expect(JSON.stringify(await av.getBars({ instrument: 'EURUSD', timeframe: 'DAILY', range: '5d' }))).not.toContain(KEY);
  });

  it('router state and service results never contain the credential', async () => {
    const okTransport = async (request: ProviderHttpRequest): Promise<ProviderHttpResponse> => {
      expect(request.headers.Authorization).toBe(`apikey ${KEY}`); // key travels by header…
      expect(request.url).not.toContain(KEY); // …never in the URL
      return json(TD_BODY);
    };
    const td = new TwelveDataAdapter({ apiKey: KEY, transport: okTransport });
    const failing = new TwelveDataAdapter({
      apiKey: KEY,
      transport: async () => json({ code: 401, message: 'invalid key', status: 'error' }, 401),
    });
    const router = new MarketDataRouter([td, failing], { now: () => 0 });
    const service = new MarketDataServiceImpl(router);

    const bars = await service.getHistoricalBars('EURUSD', 'DAILY', '5d');
    expect(JSON.stringify(bars)).not.toContain(KEY);
    const snapshot = await service.getLatestSnapshot('EURUSD');
    expect(JSON.stringify(snapshot)).not.toContain(KEY);
    const status = await service.getDataSourceStatus();
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(JSON.stringify(router.getRouterState())).not.toContain(KEY);
  });

  it('a disabled provider surfaces only a configuration message, never key material', async () => {
    const td = new TwelveDataAdapter({ apiKey: null });
    const router = new MarketDataRouter([td], { now: () => 0 });
    const service = new MarketDataServiceImpl(router);
    const result = await service.getHistoricalBars('EURUSD', 'DAILY', '5d');
    expect(result.status).toBe('NOT_CONFIGURED');
    if (result.status === 'SUCCESS') throw new Error('unreachable');
    expect(result.error.message).not.toMatch(/apikey|key|token/i);
    expect(result.error.message).toContain('configured');
  });
});
