/**
 * Provenance value object (32D).
 *
 * A reusable record answering "where did this data/claim come from?" for
 * market data, research evidence, indicator results and user-imported data.
 * Unavailable provenance is represented explicitly (`UNPROVENANCED`) — it is
 * never invented. No URL or hash is ever fabricated by the domain; callers
 * supply values or leave fields unset.
 *
 * Pure domain: no I/O, no crypto, no browser APIs.
 */
import type { Brand } from "@/domain/ids";

/** Where a piece of data came from, at the granularity the domain distinguishes. */
export const SOURCE_TYPES = [
  "RESEARCH_ARTIFACT",
  "MARKET_DATA_PROVIDER",
  "USER_INPUT",
  "DERIVED",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Identifier of a provenance-bearing source (opaque; e.g. a commit or dataset ID). */
export type ProvenanceId = Brand<string, "ProvenanceId">;

/**
 * A provenance record. Every field is optional except the source type:
 * partial knowledge is honest, a made-up value is not. A field that is
 * genuinely unknown stays `undefined` — the domain never fills gaps.
 */
export interface Provenance {
  readonly sourceType: SourceType;
  /** Human-readable source name, e.g. "Golden Reference". */
  readonly sourceName?: string;
  /** Opaque source identifier, e.g. commit, artifact ID or provider record ID. */
  readonly sourceId?: ProvenanceId;
  /** When the data was acquired/observed (ISO-8601). Undefined = not recorded. */
  readonly acquiredAt?: string;
  /** ISO-8601 start of the data's coverage. */
  readonly coverageStart?: string;
  /** ISO-8601 end of the data's coverage. */
  readonly coverageEnd?: string;
  /** Content hash where known (e.g. SHA-256 of a frozen artifact). */
  readonly hash?: string;
  /** Methodology or version label of the producing process. */
  readonly methodology?: string;
  /** Free-form limitation/note. */
  readonly notes?: string;
}

/** Marker for data whose origin is genuinely unrecorded. Never silently omitted. */
export const UNPROVENANCED: unique symbol = Symbol("UNPROVENANCED");
export type Unprovenanced = typeof UNPROVENANCED;

/** Either a provenance record, or the explicit "no provenance" marker. */
export type WithProvenance = Provenance | typeof UNPROVENANCED;

export function provenanced(sourceType: SourceType, rest: Omit<Provenance, "sourceType"> = {}): Provenance {
  return { sourceType, ...rest };
}

export function isProvenanced(value: WithProvenance): value is Provenance {
  return value !== UNPROVENANCED;
}
