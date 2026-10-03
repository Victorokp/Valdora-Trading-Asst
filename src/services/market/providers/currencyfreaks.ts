/**
 * EURUSD 1D provider adapter (32S MVP).
 *
 * Provider: CurrencyFreaks (Free plan, no credit card, 1000 calls/month,
 * daily EURUSD OHLC in USD base).
 *
 * Key is read server-side only. This file is never imported by the client
 * bundle and has no access to browser APIs or build-time env objects.
 *
 * This adapter is the only entry point a live provider has into the Valdora
 * application. The rest of the app consumes the `MarketDataProvider` /
 * `MarketDataService` seams, so swapping CurrencyFreaks for Twelve Data,
 * Alpha Vantage, EODHD or an ECB-RT feed later is a provider-file change only.
 */

import { serviceFailure, serviceSuccess, type ServiceResult } from '@/domain/errors';
import type { MarketDataProvider } from '@/services/index';
import type { MarketBar } from '@/domain/market/bar';
import type { Timeframe } from '@/domain/market/timeframe';

export interface CurrencyFreaksConfig {
  readonly apiKey: string;
  /** CurrencyFreaks base URL defaults to https://api.currencyfreaks.com/v1.0. */
  readonly baseUrl?: string;
}

export interface CurrencyFreaksTimeSeriesRow {
  readonly date: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume?: string;
}

export interface CurrencyFreaksError {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
}

export class CurrencyFreaksProviderError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'CurrencyFreaksProviderError';
    this.code = code;
    this.status = status;
  }
}

export class CurrencyFreaksProvider implements MarketDataProvider {
  readonly name = 'CurrencyFreaks' as const;
  readonly mode = 'LIVE' as const;

  constructor(private readonly config: CurrencyFreaksConfig) {}

  async getBars(
    _instrument: string,
    _timeframe: Timeframe,
    _range: string,
  ): Promise<ServiceResult<readonly MarketBar[]>> {
    try {
      const result = await this.fetchBars();
      if (result === null) {
        return serviceFailure('PROVIDER_ERROR', 'could not fetch EURUSD daily bars');
      }
      return serviceSuccess(result);
    } catch (error) {
      // The MarketDataProvider contract is result-based: adapter failures
      // surface as PROVIDER_ERROR, never as unhandled rejections.
      const message = error instanceof Error ? error.message : 'provider request failed';
      return serviceFailure('PROVIDER_ERROR', message);
    }
  }

  private async fetchBars(): Promise<MarketBar[] | null> {
    const url = new URL('/time-series/EURUSD', this.config.baseUrl);
    url.searchParams.set('function', 'TIME_SERIES_DAILY');
    url.searchParams.set('symbol', 'EURUSD');
    url.searchParams.set('interval', 'DAILY');
    url.searchParams.set('apikey', this.config.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url.toString(), { signal: controller.signal });
    } catch {
      clearTimeout(timer);
      throw new CurrencyFreaksProviderError('request timed out', 'PROVIDER_TIMEOUT', 504);
    }
    clearTimeout(timer);

    if (!response.ok) {
      const payload: unknown = await response.text().catch(() => null);
      const error = this.parseError(payload);
      if (error?.code === 'RATE_LIMITED') {
        throw new CurrencyFreaksProviderError(error.message, 'RATE_LIMITED', response.status);
      }
      throw new CurrencyFreaksProviderError(
        error?.message ?? `provider responded ${response.status}`,
        'PROVIDER_ERROR',
        response.status,
      );
    }

    let payload: unknown;
    const text = await response.text();
    try {
      payload = JSON.parse(text);
    } catch {
      throw new CurrencyFreaksProviderError('malformed JSON from provider', 'INVALID_PROVIDER_DATA');
    }

    if (payload == null || typeof payload !== 'object') {
      throw new CurrencyFreaksProviderError('provider returned an empty body', 'INVALID_PROVIDER_DATA');
    }

    if ((payload as { error?: boolean }).error === true) {
      throw new CurrencyFreaksProviderError(
        (payload as { message?: string }).message ?? 'provider rejected the request',
        'AUTH_FAILED',
      );
    }

    const rows = this.toRawBars(payload);
    if (rows.length === 0) {
      throw new CurrencyFreaksProviderError('provider returned no rows', 'NO_DATA');
    }
    return rows;
  }

  private toRawBars(payload: unknown): MarketBar[] {
    if (payload == null || typeof payload !== 'object') return [];

    const candidates: unknown[] = [];
    const map = payload as Record<string, unknown>;
    for (const key of Object.keys(map)) {
      if (key === 'timeSeries' || key === 'Time Series' || key === 'series') {
        const value = map[key];
        if (Array.isArray(value)) candidates.push(value);
        else if (value != null && typeof value === 'object' && !Array.isArray(value)) candidates.push(value);
      }
    }
    const first = candidates[0];
    const rows: readonly unknown[] = Array.isArray(first)
      ? first
      : first !== undefined && typeof first === 'object'
        ? Object.values(first as Record<string, unknown>)
        : Object.values(map);
    if (rows.length === 0) return [];

    const out: MarketBar[] = [];
    for (const row of rows) {
      if (row == null || typeof row !== 'object') continue;
      const record = row as Record<string, unknown>;
      const date = record['date'] ?? record['Date'] ?? record['id'];
      if (date == null) continue;
      const ts = this.toTimestamp(date);
      if (ts == null) continue;
      const open = this.toNumber(record['open'] ?? record['Open'] ?? record['o']);
      const high = this.toNumber(record['high'] ?? record['High'] ?? record['h']);
      const low = this.toNumber(record['low'] ?? record['Low'] ?? record['l']);
      const close = this.toNumber(record['close'] ?? record['Close'] ?? record['c']);
      if (open == null || high == null || low == null || close == null) continue;
      out.push({ instrument: 'EURUSD', timeframe: 'DAILY' as const, timestamp: ts, open, high, low, close });
    }
    return out;
  }

  private toTimestamp(date: unknown): string | null {
    if (date == null || typeof date !== 'string') return null;
    if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    if (/^\d{1,2}/.test(date)) {
      const parts = date.split('-');
      if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    const parsed = Date.parse(date);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  private toNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private parseError(payload: unknown): CurrencyFreaksError | null {
    if (payload == null || typeof payload !== 'object') return null;
    const map = payload as Record<string, unknown>;
    if (typeof map['error'] === 'boolean' && map['error'] === true) {
      return { code: 'INVALID_PROVIDER_DATA', message: map['message']?.toString() ?? 'provider rejected the request' };
    }
    if (typeof map['success'] === 'boolean' && map['success'] === false) {
      return { code: 'INVALID_PROVIDER_DATA', message: map['message']?.toString() ?? 'provider rejected the request' };
    }
    if (typeof map['status'] === 'number' && map['status'] === 429) {
      return { code: 'RATE_LIMITED', message: map['message']?.toString() ?? 'rate limit reached' };
    }
    if (typeof map['message'] === 'string') {
      return { code: 'INVALID_PROVIDER_DATA', message: map['message'] };
    }
    return null;
  }
}

const CONFIG: CurrencyFreaksConfig = {
  apiKey: process.env.VALDORA_CURRENCYFREAKS_API_KEY ?? '',
};

export const CURRENCYFREAKS_PROVIDER = new CurrencyFreaksProvider(CONFIG);

export function currencyFreaksConfig(): CurrencyFreaksConfig {
  return { apiKey: CONFIG.apiKey };
}
