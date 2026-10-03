import type { InstrumentRef } from "@/domain/types";

/**
 * Instrument catalog — configuration data, not market data.
 * Only EURUSD carries the Phase 21–31 research lineage; the six secondary
 * pairs are factually labeled as not independently validated (Part 1 §6).
 */
export const INSTRUMENTS: InstrumentRef[] = [
  { symbol: "EURUSD", label: "Euro / US Dollar", validation: "RESEARCH_BACKED" },
  { symbol: "GBPUSD", label: "British Pound / US Dollar", validation: "NOT_INDEPENDENTLY_VALIDATED" },
  { symbol: "USDJPY", label: "US Dollar / Japanese Yen", validation: "NOT_INDEPENDENTLY_VALIDATED" },
  { symbol: "AUDUSD", label: "Australian Dollar / US Dollar", validation: "NOT_INDEPENDENTLY_VALIDATED" },
  { symbol: "NZDUSD", label: "New Zealand Dollar / US Dollar", validation: "NOT_INDEPENDENTLY_VALIDATED" },
  { symbol: "USDCHF", label: "US Dollar / Swiss Franc", validation: "NOT_INDEPENDENTLY_VALIDATED" },
  { symbol: "USDCAD", label: "US Dollar / Canadian Dollar", validation: "NOT_INDEPENDENTLY_VALIDATED" },
];
