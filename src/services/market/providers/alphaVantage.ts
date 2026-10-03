/**
 * Alpha Vantage adapter — EMERGENCY provider (EURUSD daily OHLC).
 *
 * CONTRACT STATUS: UNVERIFIED (2026-10-03). The adapter is HARD-DISABLED:
 * `isEnabled()` returns false even when a credential is supplied, so the
 * router always skips it as DISABLED until the open items below are
 * verified against the provider's own documentation with a real key.
 *
 * Verified from official sources (https://www.alphavantage.co/documentation
 * and https://www.alphavantage.co/support/):
 * - Base URL `https://www.alphavantage.co/query`; `function=FX_DAILY`
 *   "returns the daily time series (timestamp, open, high, low, close) of
 *   the FX currency pair specified, updated realtime"; required
 *   `from_symbol` / `to_symbol` (three-letter forex symbols, e.g.
 *   to_symbol=USD); optional `outputsize` (default `compact`) and
 *   `datatype`; `apikey` query-parameter authentication (no header option
 *   is documented, so the key travels in the URL — another reason this
 *   adapter may only ever run behind a server boundary; request URLs are
 *   never surfaced in messages, logs or state).
 * - Free tier: 25 API requests per day; "unlimited API requests for
 *   verified open-source or educational projects" (official support page).
 * - Live probe (demo key, 2026-10-03): FX_DAILY is NOT covered by the
 *   demo key — the API answered HTTP 200 with an `Information` body
 *   ("The **demo** API key is for demo purposes only…").
 *
 * NOT YET VERIFIED (why status is UNVERIFIED):
 * - The exact success payload keys (`Time Series FX (Daily)` series key,
 *   `Meta Data` field names incl. the timezone field) — corroborated only
 *   by secondary sources, not extracted from the official docs page.
 * - Whether `outputsize=full` is free for FX; FX historical depth on the
 *   free plan; weekend/holiday row behavior; the HTTP/body shapes actually
 *   used for rate-limit and error responses.
 *
 * The parser below therefore implements the *expected* contract STRICTLY
 * (any deviation → MALFORMED/CONTRACT_MISMATCH, never a guess) and the
 * provider stays out of the fallback chain until verification completes.
 */
import type { MarketBar } from '@/domain/market/bar';
import type { CandleBoundaryInfo } from '@/domain/market/boundary';
import { fetchTransport, ProviderTransportError } from './transport';
import {
  boundMessage,
  isSixLetterSymbol,
  redactSecret,
  type ProviderAdapter,
  type ProviderAdapterResult,
  type ProviderBarRequest,
  type ProviderDataset,
  type ProviderFailureKind,
  type ProviderTransport,
  type ProviderVerification,
} from './types';

export const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

/** Expected (UNVERIFIED) series key: corroborated by secondary sources only. */
const FX_DAILY_SERIES_KEY = 'Time Series FX (Daily)';

const AV_BOUNDARY: CandleBoundaryInfo = {
  providerStatement:
    'Alpha Vantage FX_DAILY is documented as a realtime daily time series of timestamp/open/high/low/close; the exact daily candle-boundary timezone for FX is not confirmed in the verified documentation, so timestamps are preserved verbatim and no boundary is assumed.',
  confidence: 'AMBIGUOUS',
};

export interface AlphaVantageConfig {
  /** Server-supplied credential; the adapter stays disabled regardless (UNVERIFIED). */
  readonly apiKey: string | null;
  readonly baseUrl?: string;
  readonly transport?: ProviderTransport;
  readonly timeoutMs?: number;
  readonly now?: () => string;
}

function failure(kind: ProviderFailureKind, message: string): ProviderAdapterResult {
  return { ok: false, failure: { kind, message } };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export class AlphaVantageAdapter implements ProviderAdapter {
  readonly id = 'ALPHA_VANTAGE' as const;
  readonly label = 'Alpha Vantage';
  /** Hard-disabled until the open contract items listed in the header are verified. */
  readonly verification: ProviderVerification = 'UNVERIFIED';

  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly transport: ProviderTransport;
  private readonly timeoutMs: number;
  private readonly now: () => string;

  constructor(config: AlphaVantageConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? ALPHA_VANTAGE_BASE_URL;
    this.transport = config.transport ?? fetchTransport;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.now = config.now ?? (() => new Date().toISOString());
  }

  isEnabled(): boolean {
    // UNVERIFIED contracts never activate, credential or not.
    return this.verification === 'VERIFIED' && this.apiKey !== null && this.apiKey.trim().length > 0;
  }

  private sanitize(text: string): string {
    return boundMessage(redactSecret(text, this.apiKey));
  }

  async getBars(request: ProviderBarRequest): Promise<ProviderAdapterResult> {
    if (this.verification === 'UNVERIFIED') {
      return failure('CONFIGURATION', 'Alpha Vantage is disabled: contract UNVERIFIED (see adapter header for open items)');
    }
    if (!this.isEnabled()) {
      return failure('CONFIGURATION', 'Alpha Vantage is not configured (no server-side credential)');
    }
    if (request.timeframe !== 'DAILY') {
      // FX_WEEKLY exists but is deliberately not implemented while unverified.
      return failure('UNSUPPORTED', `Alpha Vantage FX_DAILY does not serve timeframe ${request.timeframe} here`);
    }
    if (!isSixLetterSymbol(request.instrument)) {
      return failure('REQUEST_REJECTED', `instrument ${request.instrument} is not in the supported symbol format`);
    }

    const fromSymbol = request.instrument.slice(0, 3);
    const toSymbol = request.instrument.slice(3);
    const url = new URL(this.baseUrl);
    url.searchParams.set('function', 'FX_DAILY');
    url.searchParams.set('from_symbol', fromSymbol);
    url.searchParams.set('to_symbol', toSymbol);
    // Only the documented `compact` (latest 100 points) is used: free-tier
    // access to `outputsize=full` for FX is not verified.
    url.searchParams.set('outputsize', 'compact');
    url.searchParams.set('apikey', this.apiKey ?? '');

    let response;
    try {
      response = await this.transport({
        url: url.toString(),
        headers: {},
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (error instanceof ProviderTransportError) {
        return failure(error.kind === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK', error.message);
      }
      return failure('PROVIDER', 'unexpected transport failure');
    }

    if (response.status === 401) return failure('AUTH', 'Alpha Vantage rejected the credential (401)');
    if (response.status === 403) return failure('AUTH', 'Alpha Vantage denied access for this plan or resource (403)');
    if (response.status === 429) return failure('RATE_LIMITED', 'Alpha Vantage rate limit reached (429)');
    if (response.status === 400) return failure('REQUEST_REJECTED', 'Alpha Vantage rejected the request (400)');
    if (response.status === 404) return failure('NOT_FOUND', 'Alpha Vantage found no data for the request (404)');
    if (response.status >= 500) return failure('PROVIDER', `Alpha Vantage server error (${response.status})`);
    if (response.status < 200 || response.status >= 300) {
      return failure('PROVIDER', `Alpha Vantage unexpected response (${response.status})`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      return failure('MALFORMED', 'Alpha Vantage returned a non-JSON body');
    }
    if (payload === null || typeof payload !== 'object') {
      return failure('MALFORMED', 'Alpha Vantage returned an empty or non-object body');
    }
    const body = payload as Record<string, unknown>;

    if (typeof body[FX_DAILY_SERIES_KEY] !== 'object' || body[FX_DAILY_SERIES_KEY] === null) {
      return this.classifyBodyWithoutSeries(body);
    }

    const meta = typeof body['Meta Data'] === 'object' && body['Meta Data'] !== null
      ? (body['Meta Data'] as Record<string, unknown>)
      : {};
    if (typeof meta['2. From Symbol'] === 'string' && meta['2. From Symbol'] !== fromSymbol) {
      return failure('CONTRACT_MISMATCH', `Alpha Vantage returned from-symbol ${meta['2. From Symbol']}, requested ${fromSymbol}`);
    }
    if (typeof meta['3. To Symbol'] === 'string' && meta['3. To Symbol'] !== toSymbol) {
      return failure('CONTRACT_MISMATCH', `Alpha Vantage returned to-symbol ${meta['3. To Symbol']}, requested ${toSymbol}`);
    }

    const series = body[FX_DAILY_SERIES_KEY] as Record<string, unknown>;
    const entries = Object.entries(series);
    if (entries.length === 0) {
      return failure('NOT_FOUND', `Alpha Vantage has no FX_DAILY rows for ${fromSymbol}/${toSymbol}`);
    }

    const bars: MarketBar[] = [];
    const seen = new Set<string>();
    for (const [timestamp, row] of entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
        return failure('MALFORMED', 'Alpha Vantage row key is outside the documented daily date format');
      }
      if (row === null || typeof row !== 'object') {
        return failure('MALFORMED', 'Alpha Vantage returned a non-object row');
      }
      const record = row as Record<string, unknown>;
      const open = toFiniteNumber(record['1. open']);
      const high = toFiniteNumber(record['2. high']);
      const low = toFiniteNumber(record['3. low']);
      const close = toFiniteNumber(record['4. close']);
      if (open === null || high === null || low === null || close === null) {
        return failure('INVALID_DATA', `Alpha Vantage row ${timestamp} has missing or non-numeric OHLC`);
      }
      if (seen.has(timestamp)) {
        return failure('INVALID_DATA', `Alpha Vantage returned duplicate timestamp ${timestamp}`);
      }
      seen.add(timestamp);
      bars.push({
        instrument: request.instrument,
        timeframe: request.timeframe,
        timestamp,
        open,
        high,
        low,
        close,
      });
    }
    bars.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    const timezone = typeof meta['5. Time Zone'] === 'string' ? meta['5. Time Zone'] : undefined;
    const dataset: ProviderDataset = {
      providerId: this.id,
      providerLabel: this.label,
      instrument: request.instrument,
      timeframe: request.timeframe,
      bars,
      retrievedAt: this.now(),
      candleBoundary: timezone !== undefined ? { ...AV_BOUNDARY, sourceTimezone: timezone } : AV_BOUNDARY,
      sourceMeta: {
        reportedSymbol: typeof meta['2. From Symbol'] === 'string'
          ? `${meta['2. From Symbol']}${meta['3. To Symbol'] ?? ''}`
          : undefined,
        reportedTimeframe: 'FX_DAILY',
      },
    };
    return { ok: true, dataset };
  }

  /**
   * A 200 body without the expected series is an error payload. Classification
   * uses documented Alpha Vantage message keys and wording heuristics; while
   * the adapter is UNVERIFIED these paths are unreachable in production and
   * pinned only by tests.
   */
  private classifyBodyWithoutSeries(body: Record<string, unknown>): ProviderAdapterResult {
    const note = [body.Information, body.Note, body['Error Message']]
      .find((v) => typeof v === 'string') as string | undefined;
    const text = note ?? 'unexpected payload without a time series';
    if (/rate limit|per day|frequency|too many/i.test(text)) {
      return failure('RATE_LIMITED', `Alpha Vantage: ${this.sanitize(text)}`);
    }
    if (/demo|api ?key/i.test(text)) {
      return failure('AUTH', `Alpha Vantage: ${this.sanitize(text)}`);
    }
    if (typeof body['Error Message'] === 'string') {
      return failure('REQUEST_REJECTED', `Alpha Vantage: ${this.sanitize(body['Error Message'])}`);
    }
    return failure('MALFORMED', `Alpha Vantage: ${this.sanitize(text)}`);
  }
}
