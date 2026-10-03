/**
 * Massive adapter — FALLBACK provider (EURUSD daily/weekly OHLC).
 *
 * CONTRACT STATUS: VERIFIED (2026-10-03) against Massive's official docs.
 * Verification sources:
 * - REST Quickstart (https://massive.com/docs/rest/quickstart): base URL
 *   `https://api.massive.com`, JSON envelope with root fields
 *   `status` / `results` / `request_id`, auth via `?apiKey=` query
 *   parameter OR `Authorization: Bearer <key>` header (header used here so
 *   the key never appears in a URL), missing/invalid key → authorization
 *   error (401).
 * - Forex Custom Bars (https://massive.com/docs/rest/forex/aggregates/
 *   custom-bars.md): `GET /v2/aggs/ticker/{forexTicker}/range/{multiplier}/
 *   {timespan}/{from}/{to}`, from/to accept `YYYY-MM-DD`, response rows are
 *   `{t (unix ms, window start), o, h, l, c, v, n, vw}` with root
 *   `ticker`/`status`/`resultsCount`; sample response shows forex ticker
 *   `C:EURUSD`; aggregates are generated from quoted bid/ask prices (not
 *   trades) in Eastern Time — no quotes in a window means NO bar.
 *   Plan tables: Currencies Basic = end-of-day recency, 2 years history
 *   (records date back to 2009-09-25 on higher plans).
 * - Knowledge base (official): free Basic tier = 5 requests/minute per
 *   product; rate-limit failure body `{"status":"ERROR","error":"…"}` with
 *   HTTP 429; timespan windows: "Day — Midnight Eastern", "Week — Sunday
 *   at midnight Eastern".
 * - No live probe was possible (a real API key is required) — this
 *   adapter stays DISABLED without a server-side credential.
 *
 * Forex daily boundary: dates are derived as the Eastern-Time calendar date
 * of the provider's window-start timestamp (t) — the timezone documented
 * for these aggregates. The raw derivation is pinned by tests; nothing is
 * re-stamped to the application's clock.
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

export const MASSIVE_BASE_URL = 'https://api.massive.com';

/**
 * Documented candle-boundary semantics for Massive forex aggregates.
 *
 * The docs state forex aggregates are computed over windows “in Eastern
 * Time (ET)” and the knowledge base states daily windows begin at midnight
 * Eastern — BUT the published sample window timestamp (t =
 * 1626912000000 = 2021-07-22T00:00:00Z) lands on UTC midnight (20:00 ET of
 * the previous day), not midnight Eastern. That contradiction keeps the
 * anchor AMBIGUOUS: dates are derived as the Eastern calendar date of the
 * provider's own window-start timestamp (consistent with the explicit ET
 * claim) and preserved verbatim; nothing is re-stamped.
 */
const MASSIVE_BOUNDARY: CandleBoundaryInfo = {
  providerStatement:
    'Massive documents forex aggregates over Eastern-Time windows built from quoted bid/ask prices; a window with no quotes produces no bar (weekends/holidays are empty intervals). The published sample window timestamp falls on UTC midnight rather than midnight Eastern, so the exact window anchor is contradictory in the docs; dates are the Eastern-Time calendar date of the provider window-start timestamp, preserved verbatim.',
  sourceTimezone: 'America/New_York',
  confidence: 'AMBIGUOUS',
};

/**
 * Response `status` values accepted as success. The docs specify "OK"; a
 * live probe of the free Currencies tier (2026-10-03) returned "DELAYED"
 * with a full, well-formed `results` array — delayed recency is a data
 * freshness property, not an error. Any other value (notably "ERROR")
 * remains a provider failure so contract drift surfaces loudly instead of
 * being served.
 */
const MASSIVE_SUCCESS_STATUSES: ReadonlySet<string> = new Set(['OK', 'DELAYED']);

const TIMESPANS: Readonly<Record<string, 'day' | 'week'>> = {
  DAILY: 'day',
  WEEKLY: 'week',
};

export interface MassiveConfig {
  /** Server-supplied credential; null/absent keeps the adapter DISABLED. */
  readonly apiKey: string | null;
  readonly baseUrl?: string;
  readonly transport?: ProviderTransport;
  readonly timeoutMs?: number;
  readonly now?: () => number;
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

/** Eastern-Time calendar date (`YYYY-MM-DD`) of an epoch-ms instant. */
export function easternDate(epochMs: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs));
  const pick = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export class MassiveAdapter implements ProviderAdapter {
  readonly id = 'MASSIVE' as const;
  readonly label = 'Massive';
  readonly verification = 'VERIFIED' as const;

  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly transport: ProviderTransport;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(config: MassiveConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? MASSIVE_BASE_URL;
    this.transport = config.transport ?? fetchTransport;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.now = config.now ?? (() => Date.now());
  }

  isEnabled(): boolean {
    return this.apiKey !== null && this.apiKey.trim().length > 0;
  }

  private sanitize(text: string): string {
    return boundMessage(redactSecret(text, this.apiKey));
  }

  async getBars(request: ProviderBarRequest): Promise<ProviderAdapterResult> {
    if (!this.isEnabled()) {
      return failure('CONFIGURATION', 'Massive is not configured (no server-side credential)');
    }
    const timespan = TIMESPANS[request.timeframe];
    if (!timespan) {
      return failure('UNSUPPORTED', `Massive does not serve timeframe ${request.timeframe} here`);
    }
    if (!isSixLetterSymbol(request.instrument)) {
      return failure('REQUEST_REJECTED', `instrument ${request.instrument} is not in the supported symbol format`);
    }
    const days = rangeToDays(request.range);
    if (days === null) {
      return failure('REQUEST_REJECTED', `range "${request.range}" violates the <n><d|w|y> range grammar`);
    }

    const nowMs = this.now();
    const to = easternDate(nowMs);
    const from = easternDate(nowMs - days * 86_400_000);
    const ticker = `C:${request.instrument}`;
    const path = `/v2/aggs/ticker/${ticker}/range/1/${timespan}/${from}/${to}`;
    const url = new URL(path, this.baseUrl);
    url.searchParams.set('sort', 'asc');

    let response;
    try {
      response = await this.transport({
        url: url.toString(),
        headers: { Authorization: `Bearer ${this.apiKey ?? ''}` },
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (error instanceof ProviderTransportError) {
        return failure(error.kind === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK', error.message);
      }
      return failure('PROVIDER', 'unexpected transport failure');
    }

    if (response.status === 401) return failure('AUTH', 'Massive rejected the credential (401)');
    if (response.status === 403) return failure('AUTH', 'Massive denied access for this plan or resource (403)');
    if (response.status === 429) return failure('RATE_LIMITED', 'Massive rate limit reached (429)');
    if (response.status === 400) {
      return failure('REQUEST_REJECTED', `Massive rejected the request (400): ${this.sanitize(response.body)}`);
    }
    if (response.status === 404) return failure('NOT_FOUND', 'Massive found no data for the request (404)');
    if (response.status >= 500) return failure('PROVIDER', `Massive server error (${response.status})`);
    if (response.status < 200 || response.status >= 300) {
      return failure('PROVIDER', `Massive unexpected response (${response.status})`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      return failure('MALFORMED', 'Massive returned a non-JSON body');
    }
    if (payload === null || typeof payload !== 'object') {
      return failure('MALFORMED', 'Massive returned an empty or non-object body');
    }
    const body = payload as Record<string, unknown>;

    if (typeof body.status !== 'string' || !MASSIVE_SUCCESS_STATUSES.has(body.status)) {
      const providerMessage = typeof body.error === 'string' ? body.error : `status ${String(body.status)}`;
      return failure(this.classifyErrorText(providerMessage), this.sanitize(`Massive error: ${providerMessage}`));
    }
    if (typeof body.ticker === 'string' && body.ticker !== ticker) {
      return failure('CONTRACT_MISMATCH', `Massive returned data for ${body.ticker}, requested ${ticker}`);
    }
    const results = body.results;
    if (!Array.isArray(results)) {
      return failure('MALFORMED', 'Massive response missing the results array');
    }
    if (results.length === 0) {
      return failure('NOT_FOUND', `Massive has no ${timespan} bars for ${ticker} in ${from}..${to}`);
    }

    const bars: MarketBar[] = [];
    const seen = new Set<string>();
    for (const row of results) {
      if (row === null || typeof row !== 'object') {
        return failure('MALFORMED', 'Massive returned a non-object row');
      }
      const record = row as Record<string, unknown>;
      const t = toFiniteNumber(record.t);
      const open = toFiniteNumber(record.o);
      const high = toFiniteNumber(record.h);
      const low = toFiniteNumber(record.l);
      const close = toFiniteNumber(record.c);
      if (t === null) {
        return failure('INVALID_DATA', 'Massive row has a missing or non-numeric window timestamp');
      }
      if (open === null || high === null || low === null || close === null) {
        return failure('INVALID_DATA', 'Massive row has missing or non-numeric OHLC');
      }
      // Date label = Eastern-Time calendar date of the window start, per the
      // provider's documented ET window semantics. Never re-stamped to app time.
      const timestamp = easternDate(t);
      if (seen.has(timestamp)) {
        return failure('INVALID_DATA', `Massive returned duplicate window date ${timestamp}`);
      }
      seen.add(timestamp);
      const volume = toFiniteNumber(record.v);
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
      retrievedAt: new Date(this.now()).toISOString(),
      candleBoundary: MASSIVE_BOUNDARY,
      sourceMeta: {
        reportedSymbol: typeof body.ticker === 'string' ? body.ticker : undefined,
        reportedTimeframe: timespan,
      },
    };
    return { ok: true, dataset };
  }

  /** Map a documented error body onto a failure class (official KB examples). */
  private classifyErrorText(text: string): ProviderFailureKind {
    if (/rate limit|too many|429/i.test(text)) return 'RATE_LIMITED';
    if (/api[_ ]?key|unauthorized|forbidden|permission|401/i.test(text)) return 'AUTH';
    return 'PROVIDER';
  }
}
