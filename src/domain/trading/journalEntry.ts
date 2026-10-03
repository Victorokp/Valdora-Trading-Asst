/**
 * Journal entries (32E).
 *
 * User-authored journal records: reviews, lessons, notes. Purely user-owned
 * data — never computed by the system, never mixed with research evidence.
 */
import type { JournalEntryId, TradeId } from "@/domain/ids";
import type { Instrument } from "@/domain/instruments/instrument";

export const JOURNAL_ENTRY_KINDS = ["REVIEW", "LESSON", "NOTE"] as const;
export type JournalEntryKind = (typeof JOURNAL_ENTRY_KINDS)[number];

export interface JournalEntry {
  readonly id: JournalEntryId;
  /** ISO-8601 creation time. */
  readonly createdAt: string;
  /** ISO-8601 last-edit time, when edited. */
  readonly updatedAt?: string;
  readonly kind: JournalEntryKind;
  readonly title: string;
  readonly body: string;
  /** Trades this entry reviews (optional; a lesson need not reference a trade). */
  readonly relatedTradeIds: readonly TradeId[];
  /** Optional instrument context. */
  readonly relatedInstrument?: Instrument["symbol"];
  readonly tags: readonly string[];
}
