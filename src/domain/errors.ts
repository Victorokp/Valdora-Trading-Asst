/**
 * Shared service result / error model (32D/32S).
 *
 * Services return structured results instead of throwing opaque errors across
 * service boundaries. Research-integrity failures (`INTEGRITY_ERROR`) are a
 * distinct class from ordinary provider failures  -  they must never be
 * swallowed, retried blindly, or rendered as a generic "provider problem".
 *
 * Pure domain: no HTTP, no browser APIs, no I/O.
 */

/**
 * The closed ten-status vocabulary (32D contract, pinned by the domain test).
 * It is deliberately NOT open-ended: `toUIState`, the AI context layer and
 * every service consumer are built on exactly these statuses. Later failure
 * kinds map onto the existing vocabulary instead of widening it — market-data
 * staleness → UNAVAILABLE (stale data is unavailable, never fresh),
 * quality-gate rejection → VALIDATION_ERROR, provider timeout/auth/invalid-
 * payload faults → PROVIDER_ERROR or PERMISSION_DENIED.
 */
export const SERVICE_STATUSES = [
  'SUCCESS',
  'UNAVAILABLE',
  'NOT_CONFIGURED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'INTEGRITY_ERROR',
  'UNKNOWN',
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export type ServiceFailureStatus =
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INTEGRITY_ERROR'
  | 'UNKNOWN';

export interface ServiceError {
  readonly status: ServiceFailureStatus;
  /** User-safe message. Technical detail must go to `detail`, never to the UI. */
  readonly message: string;
  readonly detail?: string;
  /** Optional underlying cause (e.g. a caught provider error). Never logged with secrets. */
  readonly cause?: unknown;
}

export type ServiceResult<T> =
  | { readonly status: 'SUCCESS'; readonly value: T }
  | { readonly status: ServiceFailureStatus; readonly error: ServiceError; readonly value?: never };

export function serviceSuccess<T>(value: T): ServiceResult<T> {
  return { status: 'SUCCESS', value };
}

export function serviceFailure<T>(
  status: ServiceFailureStatus,
  message: string,
  detail?: string,
): ServiceResult<T> {
  return {
    status,
    error: detail !== undefined ? { status, message, detail } : { status, message },
  };
}

export function isIntegrityFailure<T>(result: ServiceResult<T>): boolean {
  return result.status === 'INTEGRITY_ERROR';
}
