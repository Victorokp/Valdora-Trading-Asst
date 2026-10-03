/**
 * Market-data provider adapters (32T multi-provider architecture).
 *
 * ISOLATION RULE: nothing in the client bundle may import this folder.
 * The app composition root (`src/services/app.tsx`) keeps the honest
 * `UnconfiguredMarketDataService`; the router (`../router`) is composed only
 * by tests and, later, by a server-side boundary that injects credentials
 * (TWELVEDATA_API_KEY / MASSIVE_API_KEY / ALPHAVANTAGE_API_KEY — server env
 * only, never client code, never this bundle).
 *
 * Provider contract status (verified against official documentation AND
 * live contract probes with server-side keys, 2026-10-03 — NOT merely
 * TypeScript):
 * - Twelve Data   : VERIFIED → enabled only with a server-side key
 * - Massive       : VERIFIED → enabled only with a server-side key
 *                   (live: the free tier answers status "DELAYED", accepted)
 * - Alpha Vantage : VERIFIED → enabled only with a server-side key
 *                   (live FX_DAILY success shape confirmed)
 *
 * `currencyfreaks.ts` remains quarantined as incomplete, unverified work:
 * it is intentionally NOT re-exported here and must never be activated.
 */
export type {
  CandleBoundaryInfo,
} from '@/domain/market/boundary';
export type {
  ProviderAdapter,
  ProviderAdapterResult,
  ProviderBarRequest,
  ProviderDataset,
  ProviderFailure,
  ProviderFailureKind,
  ProviderHttpRequest,
  ProviderHttpResponse,
  ProviderId,
  ProviderSourceMeta,
  ProviderTransport,
  ProviderVerification,
} from './types';

export { TwelveDataAdapter, TWELVE_DATA_BASE_URL, type TwelveDataConfig } from './twelveData';
export { MassiveAdapter, MASSIVE_BASE_URL, easternDate, type MassiveConfig } from './massive';
export { AlphaVantageAdapter, ALPHA_VANTAGE_BASE_URL, type AlphaVantageConfig } from './alphaVantage';
export { fetchTransport, ProviderTransportError } from './transport';
