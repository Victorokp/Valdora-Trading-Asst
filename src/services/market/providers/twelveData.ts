/**
 * Twelve Data adapter — PRIMARY provider (EURUSD daily/weekly OHLC).
 *
 * CONTRACT STATUS: VERIFIED (2026-10-03).
 * Verification sources:
 * - Official docs (machine-readable): https://twelvedata.com/docs/llms/
 *   (introduction.md, market-data/time-series.md) — base URL
 *   `https://api.twelvedata.com`, endpoint `/time_series`, auth via
 *   `apikey` query parameter or `Authorization: apikey <key>` header
 *   (header recommended by docs; used here so the key never appears in a
 *   URL), symbol format `EUR/USD`, `interval=1day|1week`, `outputsize`
 *   1–5000 (default 30), response `{meta, values[], status}` with OHLC as
 *   strings, `datetime` = bar-open time in exchange-local time (timezone
 *   param ignored for 1day/1week — strictly exchange-local), error bodies
 *   `{code, message, status: "error"}` for 400/401/403/404/414/429/500.
 * - Live probe (demo key, 2026-10-03): EUR/USD `interval=1day` returned
 *   `status: "ok"`, `meta` {symbol, interval, currency_base, currency_quote,
 *   type} and date-only `datetime` values with string OHLC — shape matched
 *   the docs exactly. Note: the live forex meta carried NO exchange/timezone
 *   field and a bar stamped 2026-10-03 (a Saturday) was present, so the
 *   exact forex daily boundary is AMBIGUOUS: timestamps are preserved
 *   verbatim and never re-stamped.
 * - Free tier (official pricing.md): Basic $0 — 8 API credits/min,
 *   800 requests/day, real-time forex included; `/time_series` costs
 *   1 credit/symbol. Licensing: Basic = internal non-display use only.
 *
 * Activated only when a server-side boundary supplies a credential;
 * without one this adapter reports CONFIGURATION and stays DISABLED.
 */
import type { MarketBar } from '@/domain/market/bar';
import type { CandleBoundaryInfo } from '@/domain/market/boundary';
import { fetchTransport, ProviderTransportError } from './transport';
import {
  boundMessage,
  isSixLetterSymbol,
  rangeToDays,
  redactSecret,
  type ProviderAdapter,
  type ProviderAdapterResult,
  type ProviderBarRequest,
  type ProviderDataset,
  type ProviderFailureKind,
  type ProviderTransport,
} from './types';

export const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

/** Documented candle-boundary caveat for Twelve Data daily/weekly forex bars. */
const TWELVE_DATA_BOUNDARY: CandleBoundaryInfo = {
  providerStatement:
    'Twelve Data documents datetime as the bar OPEN time in exchange-local time, and that the timezone parameter is ignored for 1day/1week (values are strictly exchange-local). The live EUR/USD probe returned no exchange/timezone metadata, so the exact forex daily boundary is unverified; timestamps are preserved verbatim.',
  confidence: 'AMBIGUOUS',
};

const INTERVALS: Readonly<Record<string, '1day' | '1week'>> = {
  DAILY: '1day',
  WEEKLY: '1week',
};

export interface TwelveDataConfig {
  /** Server-supplied credential; null/absent keeps the adapter DISABLED. */
  readonly apiKey: string | null;
  readonly baseUrl?: string;
  readonly transport?: ProviderTransport;
  readonly timeoutMs?: number;
  readonly now?: () => string;
}

function failure(kind: ProviderFailureKind, message: string): ProviderAdapterResult {
  return { ok: false, failure: { kind, message } };
}

/** Strict finite-number parse; returns null when the value is not usable. */
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

export class TwelveDataAdapter implements ProviderAdapter {
  readonly id = 'TWELVE_DATA' as const;
  readonly label = 'Twelve Data';
  readonly verification = 'VERIFIED' as const;

  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly transport: ProviderTransport;
  private readonly timeoutMs: number;
  private readonly now: () => string;

  constructor(config: TwelveDataConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? TWELVE_DATA_BASE_URL;
    this.transport = config.transport ?? fetchTransport;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.now = config.now ?? (() => new Date().toISOString());
  }

  isEnabled(): boolean {
    return this.apiKey !== null && this.apiKey.trim().length > 0;
  }

  /** Redact the credential from any provider-supplied text (security contract). */
  private sanitize(text: string): string {
    return boundMessage(redactSecret(text, this.apiKey));
  }

  async getBars(request: ProviderBarRequest): Promise<ProviderAdapterResult> {
    if (!this.isEnabled()) {
      return failure('CONFIGURATION', 'Twelve Data is not configured (no server-side credential)');
    }
    const interval = INTERVALS[request.timeframe];
    if (!interval) {
      return failure('UNSUPPORTED', `Twelve Data does not serve timeframe ${request.timeframe} here`);
    }
    if (!isSixLetterSymbol(request.instrument)) {
      // Verified adapters only construct symbols in the documented format;
      // anything else is a request-contract violation, surfaced deterministically.
      return failure('REQUEST_REJECTED', `instrument ${request.instrument} is not in the supported symbol format`);
    }
    const days = rangeToDays(request.range);
    if (days === null) {
      return failure('REQUEST_REJECTED', `range "${request.range}" violates the <n><d|w|y> range grammar`);
    }
    const points = Math.min(5000, Math.max(1, interval === '1week' ? Math.ceil(days / 7) : days));

    const symbol = `${request.instrument.slice(0, 3)}/${request.instrument.slice(3)}`;
    const url = new URL('/time_series', this.baseUrl);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('outputsize', String(points));

    let response;
    try {
      response = await this.transport({
        url: url.toString(),
        headers: { Authorization: `apikey ${this.apiKey ?? ''}` },
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (error instanceof ProviderTransportError) {
        return failure(error.kind === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK', error.message);
      }
      return failure('PROVIDER', 'unexpected transport failure');
    }

    const statusFailure = this.classifyHttpStatus(response.status, response.body);
    if (statusFailure) return statusFailure;

    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      return failure('MALFORMED', 'Twelve Data returned a non-JSON body');
    }
    if (payload === null || typeof payload !== 'object') {
      return failure('MALFORMED', 'Twelve Data returned an empty or non-object body');
    }
    const body = payload as Record<string, unknown>;

    // Documented error shape: {code, message, status: "error"}.
    if (body.status === 'error' || typeof body.code === 'number') {
      const providerMessage = typeof body.message === 'string' ? body.message : 'provider reported an error';
      const kind = this.classifyCode(typeof body.code === 'number' ? body.code : response.status);
      return failure(kind, this.sanitize(`Twelve Data error ${String(body.code)}: ${providerMessage}`));
    }
    if (body.status !== 'ok') {
      return failure('MALFORMED', 'Twelve Data response missing status "ok"');
    }
    const meta = body.meta;
    if (meta === null || typeof meta !== 'object') {
      return failure('MALFORMED', 'Twelve Data response missing meta');
    }
    const metaRecord = meta as Record<string, unknown>;
    if (typeof metaRecord.symbol === 'string' && metaRecord.symbol !== symbol) {
      return failure('CONTRACT_MISMATCH', `Twelve Data returned data for ${metaRecord.symbol}, requested ${symbol}`);
    }
    if (typeof metaRecord.interval === 'string' && metaRecord.interval !== interval) {
      return failure('CONTRACT_MISMATCH', `Twelve Data returned interval ${metaRecord.interval}, requested ${interval}`);
    }
    const values = body.values;
    if (!Array.isArray(values)) {
      return failure('MALFORMED', 'Twelve Data response missing the values array');
    }
    if (values.length === 0) {
      return failure('NOT_FOUND', `Twelve Data has no ${interval} rows for ${symbol}`);
    }

    const bars: MarketBar[] = [];
    const seen = new Set<string>();
    for (const row of values) {
      if (row === null || typeof row !== 'object') {
        return failure('MALFORMED', 'Twelve Data returned a non-object row');
      }
      const record = row as Record<string, unknown>;
      const timestamp = record.datetime;
      if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
        return failure('MALFORMED', 'Twelve Data row has a datetime outside the documented daily date format');
      }
      const open = toFiniteNumber(record.open);
      const high = toFiniteNumber(record.high);
      const low = toFiniteNumber(record.low);
      const close = toFiniteNumber(record.close);
      if (open === null || high === null || low === null || close === null) {
        return failure('INVALID_DATA', `Twelve Data row ${timestamp} has missing or non-numeric OHLC`);
      }
      if (seen.has(timestamp)) {
        return failure('INVALID_DATA', `Twelve Data returned duplicate timestamp ${timestamp}`);
      }
      seen.add(timestamp);
      const volume = toFiniteNumber(record.volume);
      bars.push({
        instrument: request.instrument,
        timeframe: request.timeframe,
        timestamp,
        open,
        high,
        low,
        close,
        ...(volume !== null && volume >= 0 ? { volume } : {}),
      });
    }
    bars.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    const dataset: ProviderDataset = {
      providerId: this.id,
      providerLabel: this.label,
      instrument: request.instrument,
      timeframe: request.timeframe,
      bars,
      retrievedAt: this.now(),
      candleBoundary: {
        ...TWELVE_DATA_BOUNDARY,
        ...(typeof metaRecord.exchange_timezone === 'string'
          ? { sourceTimezone: metaRecord.exchange_timezone }
          : {}),
      },
      sourceMeta: {
        reportedSymbol: typeof metaRecord.symbol === 'string' ? metaRecord.symbol : undefined,
        reportedTimeframe: typeof metaRecord.interval === 'string' ? metaRecord.interval : undefined,
      },
    };
    return { ok: true, dataset };
  }

  private classifyHttpStatus(status: number, body: string): ProviderAdapterResult | null {
    if (status >= 200 && status < 300) return null;
    switch (status) {
      case 400:
        return failure('REQUEST_REJECTED', `Twelve Data rejected the request (400): ${this.sanitize(body)}`);
      case 401:
        return failure('AUTH', 'Twelve Data rejected the credential (401)');
      case 403:
        return failure('AUTH', 'Twelve Data denied access for this plan or resource (403)');
      case 404:
        return failure('NOT_FOUND', 'Twelve Data found no data for the request (404)');
      case 429:
        return failure('RATE_LIMITED', 'Twelve Data rate limit reached (429)');
      default:
        if (status >= 500) return failure('PROVIDER', `Twelve Data server error (${status})`);
        return failure('PROVIDER', `Twelve Data unexpected response (${status})`);
    }
  }

  private classifyCode(code: number): ProviderFailureKind {
    switch (code) {
      case 400:
      case 414:
        return 'REQUEST_REJECTED';
      case 401:
      case 403:
        return 'AUTH';
      case 404:
        return 'NOT_FOUND';
      case 429:
        return 'RATE_LIMITED';
      default:
        return code >= 500 ? 'PROVIDER' : 'MALFORMED';
    }
  }
}
