/**
 * Market-data quality gate (32F).
 *
 * Every imported market dataset passes deterministic validation BEFORE it is
 * accepted into the application. Hard failures reject the whole dataset —
 * bad data is never silently repaired, deduplicated or interpolated (the
 * G3 principle, applied to the app's own market-data boundary). Warnings are
 * reported and must not be silently dropped, but they do not fail the gate.
 *
 * Pure domain: no I/O, no provider calls.
 */
import type { MarketBar } from "@/domain/market/bar";
import type { Timeframe } from "@/domain/market/timeframe";

/** Raw record as imported from a source before structural validation. */
export interface RawBarInput {
  readonly instrument: string;
  readonly timeframe: Timeframe;
  readonly timestamp: string;
  readonly open?: unknown;
  readonly high?: unknown;
  readonly low?: unknown;
  readonly close?: unknown;
  readonly volume?: unknown;
}

export type MarketDataErrorCode =
  | "DUPLICATE_TIMESTAMP"
  | "MISSING_OHLC"
  | "NON_NUMERIC_OHLC"
  | "NON_POSITIVE_PRICE"
  | "HIGH_BELOW_LOW"
  | "OPEN_OUT_OF_RANGE"
  | "CLOSE_OUT_OF_RANGE"
  | "INVALID_TIMESTAMP"
  | "TIMEFRAME_MISMATCH"
  | "INSTRUMENT_MISMATCH";

export type MarketDataWarningCode =
  | "WEEKEND_ROW"
  | "HOLIDAY_GAP"
  | "UNSORTED_INPUT"
  | "UNUSUAL_GAP";

export interface QualityError {
  readonly code: MarketDataErrorCode;
  readonly message: string;
  /** Row timestamp the error refers to, when row-scoped. */
  readonly timestamp?: string;
}

export interface QualityWarning {
  readonly code: MarketDataWarningCode;
  readonly message: string;
  readonly timestamp?: string;
}

export interface MarketDataQualityReport {
  readonly rowsExamined: number;
  /** Rows free of hard errors (the rows a PASSing dataset would accept). */
  readonly acceptedRows: number;
  readonly errors: readonly QualityError[];
  readonly warnings: readonly QualityWarning[];
  /** PASS iff no hard errors. Warnings never fail the gate. */
  readonly status: "PASS" | "FAIL";
  readonly coverageStart?: string;
  readonly coverageEnd?: string;
  readonly duplicateTimestamps: readonly string[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Parse a timestamp; returns epoch ms or null when invalid. */
function parseTimestamp(ts: string): number | null {
  if (ts === "") return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

function dayOfWeek(ts: string): number | null {
  const ms = parseTimestamp(ts);
  return ms === null ? null : new Date(ms).getUTCDay(); // 0 = Sunday, 6 = Saturday
}

/**
 * Validate a candidate dataset. Deterministic: identical input yields an
 * identical report (stable iteration and ordering). Gap analysis uses an
 * internally sorted copy; the input is never mutated.
 */
export function validateMarketDataset(
  bars: readonly RawBarInput[],
  opts: { requireUniqueTimestamps?: boolean; expectedInstrument?: string } = {},
): MarketDataQualityReport {
  const requireUnique = opts.requireUniqueTimestamps ?? true;
  const expectedInstrument = opts.expectedInstrument;
  const errors: QualityError[] = [];
  const warnings: QualityWarning[] = [];
  const validRows: { bar: RawBarInput; ms: number }[] = [];
  let acceptedRows = 0;

  // --- per-row structural validation (stable order) -------------------------
  for (const bar of bars) {
    const ms = parseTimestamp(bar.timestamp);
    if (ms === null) {
      errors.push({ code: "INVALID_TIMESTAMP", message: `invalid timestamp ${JSON.stringify(bar.timestamp)}`, timestamp: bar.timestamp });
      continue;
    }
    let rowError = false;
    const fields = { open: bar.open, high: bar.high, low: bar.low, close: bar.close };
    for (const [name, value] of Object.entries(fields)) {
      if (value === undefined) {
        errors.push({ code: "MISSING_OHLC", message: `missing ${name}`, timestamp: bar.timestamp });
        rowError = true;
      } else if (!isFiniteNumber(value)) {
        errors.push({ code: "NON_NUMERIC_OHLC", message: `non-numeric ${name}`, timestamp: bar.timestamp });
        rowError = true;
      } else if (value <= 0) {
        errors.push({ code: "NON_POSITIVE_PRICE", message: `non-positive ${name}`, timestamp: bar.timestamp });
        rowError = true;
      }
    }
    if (!rowError) {
      const { open, high, low, close } = fields as { open: number; high: number; low: number; close: number };
      if (high < low) {
        errors.push({ code: "HIGH_BELOW_LOW", message: "high below low", timestamp: bar.timestamp });
        rowError = true;
      } else {
        if (open < low || open > high) {
          errors.push({ code: "OPEN_OUT_OF_RANGE", message: "open outside high-low range", timestamp: bar.timestamp });
          rowError = true;
        }
        if (close < low || close > high) {
          errors.push({ code: "CLOSE_OUT_OF_RANGE", message: "close outside high-low range", timestamp: bar.timestamp });
          rowError = true;
        }
      }
      if (bar.volume !== undefined && (!isFiniteNumber(bar.volume) || bar.volume < 0)) {
        errors.push({ code: "NON_NUMERIC_OHLC", message: "non-numeric volume", timestamp: bar.timestamp });
        rowError = true;
      }
    }
    // timeframe metadata must be consistent within one dataset
    if (bar.timeframe !== bars[0]?.timeframe) {
      errors.push({ code: "TIMEFRAME_MISMATCH", message: `mixed timeframes in dataset (${String(bar.timeframe)})`, timestamp: bar.timestamp });
      rowError = true;
    }
    // when the caller declares the expected instrument, every row must match
    if (expectedInstrument !== undefined && bar.instrument !== expectedInstrument) {
      errors.push({
        code: "INSTRUMENT_MISMATCH",
        message: `row instrument ${bar.instrument} does not match expected ${expectedInstrument}`,
        timestamp: bar.timestamp,
      });
      rowError = true;
    }
    if (!rowError) {
      acceptedRows += 1;
      validRows.push({ bar, ms });
      const dow = dayOfWeek(bar.timestamp);
      if (dow === 0 || dow === 6) {
        warnings.push({ code: "WEEKEND_ROW", message: "row dated on a weekend", timestamp: bar.timestamp });
      }
    }
  }

  // --- duplicate timestamps (uniqueness required for daily/weekly bars) ------
  const duplicateTimestamps: string[] = [];
  if (requireUnique) {
    const counts = new Map<string, number>();
    for (const { bar } of validRows) counts.set(bar.timestamp, (counts.get(bar.timestamp) ?? 0) + 1);
    for (const [ts, n] of counts) {
      if (n > 1) {
        duplicateTimestamps.push(ts);
        errors.push({ code: "DUPLICATE_TIMESTAMP", message: `${n} rows share timestamp ${ts} (uniqueness required; never deduplicated)`, timestamp: ts });
      }
    }
  }

  // --- ordering + calendar-gap warnings on the time-sorted copy ---------------
  const sorted = [...validRows].sort((a, b) => a.ms - b.ms);
  const inputWasSorted = validRows.every((row, i) => i === 0 || validRows[i - 1].ms <= row.ms);
  if (validRows.length > 1 && !inputWasSorted) {
    warnings.push({ code: "UNSORTED_INPUT", message: "input rows were not in chronological order (normalized copy is sorted)" });
  }
  const tf = bars[0]?.timeframe;
  for (let i = 1; i < sorted.length; i++) {
    if (tf !== "DAILY") break; // weekly intervals are irregular by definition
    const gapDays = (sorted[i].ms - sorted[i - 1].ms) / 86_400_000;
    if (gapDays > 10) {
      warnings.push({ code: "UNUSUAL_GAP", message: `${gapDays.toFixed(0)}-day gap`, timestamp: sorted[i].bar.timestamp });
    } else if (gapDays > 3) {
      warnings.push({ code: "HOLIDAY_GAP", message: `${gapDays.toFixed(0)}-day gap (possible holiday)`, timestamp: sorted[i].bar.timestamp });
    }
  }

  return {
    rowsExamined: bars.length,
    acceptedRows,
    errors,
    warnings,
    status: errors.length === 0 ? "PASS" : "FAIL",
    coverageStart: sorted.length > 0 ? sorted[0].bar.timestamp : undefined,
    coverageEnd: sorted.length > 0 ? sorted[sorted.length - 1].bar.timestamp : undefined,
    duplicateTimestamps,
  };
}

/**
 * Normalize a PASSing dataset into typed, chronologically-sorted bars.
 * Returns VALIDATION_ERROR carrying the quality report — a FAILing dataset
 * is never accepted (no repair, no dedup, no interpolation).
 */
export function normalizeDataset(
  bars: readonly RawBarInput[],
  opts: { requireUniqueTimestamps?: boolean; expectedInstrument?: string } = {},
): { ok: true; bars: readonly MarketBar[]; report: MarketDataQualityReport } | { ok: false; report: MarketDataQualityReport } {
  const report = validateMarketDataset(bars, opts);
  if (report.status === "FAIL") return { ok: false, report };
  const sorted = [...bars].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const typed: MarketBar[] = sorted.map((b) => ({
    instrument: b.instrument,
    timeframe: b.timeframe,
    timestamp: b.timestamp,
    open: b.open as number,
    high: b.high as number,
    low: b.low as number,
    close: b.close as number,
    ...(b.volume !== undefined ? { volume: b.volume as number } : {}),
  }));
  return { ok: true, bars: typed, report };
}
