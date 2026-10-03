/**
 * Shared HTTP transport for market-data adapters.
 *
 * - Credentials are sent via HTTP header wherever the provider documents a
 *   header option (Twelve Data `Authorization: apikey …`, Massive
 *   `Authorization: Bearer …`). Alpha Vantage documents query-parameter
 *   auth only; its adapter keeps the key in the URL and relies on the hard
 *   rule that no adapter ever places a request URL into a message, log,
 *   error or state — so the key still cannot be surfaced.
 * - Timeout and network failures are classified here so adapters never
 *   guess: the transport throws `ProviderTransportError` with a kind the
 *   adapter maps directly to a `ProviderFailureKind`.
 * - No logging: this module never writes to console or storage.
 */
import type { ProviderHttpRequest, ProviderHttpResponse, ProviderTransport } from './types';

export class ProviderTransportError extends Error {
  constructor(
    readonly kind: 'TIMEOUT' | 'NETWORK',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderTransportError';
  }
}

function classify(error: unknown, aborted: boolean): ProviderTransportError {
  if (aborted) return new ProviderTransportError('TIMEOUT', 'provider request timed out');
  void error;
  return new ProviderTransportError('NETWORK', 'network error while contacting the provider');
}

/** Production transport: fetch with an abort-based timeout. */
export const fetchTransport: ProviderTransport = async (
  request: ProviderHttpRequest,
): Promise<ProviderHttpResponse> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(request.url, {
        headers: { ...request.headers },
        signal: controller.signal,
      });
    } catch (error) {
      throw classify(error, controller.signal.aborted);
    }
    let body: string;
    try {
      body = await response.text();
    } catch (error) {
      throw classify(error, controller.signal.aborted);
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};
