/**
 * Saved instruments / watchlist (32E).
 *
 * User-owned list of instruments they follow. The list may reference only
 * instruments the application knows; it does not define instruments (the
 * catalog does) and never fabricates market data for entries.
 */
import type { Instrument } from "@/domain/instruments/instrument";

export interface WatchlistEntry {
  readonly symbol: Instrument["symbol"];
  /** ISO-8601 time the user added the pair. */
  readonly addedAt: string;
  readonly note?: string;
}
