import { describe, expect, it } from "vitest";

import { normalizeDataset, validateMarketDataset, type RawBarInput } from "@/domain/market/quality";

function bar(overrides: Partial<RawBarInput>): RawBarInput {
  return {
    instrument: "EURUSD",
    timeframe: "DAILY",
    timestamp: "2026-09-21",
    open: 1.1,
    high: 1.2,
    low: 1.0,
    close: 1.15,
    ...overrides,
  };
}

describe("market-data quality gate", () => {
  it("passes a clean dataset and reports coverage", () => {
    const report = validateMarketDataset([
      bar({ timestamp: "2026-09-21" }),
      bar({ timestamp: "2026-09-22" }),
      bar({ timestamp: "2026-09-23" }),
    ]);
    expect(report.status).toBe("PASS");
    expect(report.errors).toStrictEqual([]);
    expect(report.acceptedRows).toBe(3);
    expect(report.coverageStart).toBe("2026-09-21");
    expect(report.coverageEnd).toBe("2026-09-23");
  });

  it("hard-fails duplicate timestamps (uniqueness required; never deduplicated)", () => {
    const report = validateMarketDataset([
      bar({ timestamp: "2026-09-21" }),
      bar({ timestamp: "2026-09-21" }),
    ]);
    expect(report.status).toBe("FAIL");
    expect(report.errors.some((e) => e.code === "DUPLICATE_TIMESTAMP")).toBe(true);
    expect(report.duplicateTimestamps).toStrictEqual(["2026-09-21"]);
  });

  it("hard-fails missing and non-numeric OHLC", () => {
    const report = validateMarketDataset([
      bar({ open: undefined }),
      bar({ close: "1.2" as unknown as number }),
    ]);
    expect(report.status).toBe("FAIL");
    expect(report.errors.some((e) => e.code === "MISSING_OHLC")).toBe(true);
    expect(report.errors.some((e) => e.code === "NON_NUMERIC_OHLC")).toBe(true);
  });

  it("hard-fails non-positive prices and OHLC relationship violations", () => {
    const report = validateMarketDataset([
      bar({ open: -1 }),
      bar({ high: 0.9, low: 1.0 }),
      bar({ close: 99 }),
    ]);
    expect(report.errors.some((e) => e.code === "NON_POSITIVE_PRICE")).toBe(true);
    expect(report.errors.some((e) => e.code === "HIGH_BELOW_LOW")).toBe(true);
    expect(report.errors.some((e) => e.code === "CLOSE_OUT_OF_RANGE")).toBe(true);
  });

  it("hard-fails invalid timestamps and mixed timeframe metadata", () => {
    const report = validateMarketDataset([
      bar({ timestamp: "not-a-date" }),
      bar({ timeframe: "WEEKLY" }),
    ]);
    expect(report.errors.some((e) => e.code === "INVALID_TIMESTAMP")).toBe(true);
    expect(report.errors.some((e) => e.code === "TIMEFRAME_MISMATCH")).toBe(true);
  });

  it("warns on weekend rows, unsorted input and unusual gaps without failing", () => {
    const report = validateMarketDataset([
      bar({ timestamp: "2026-09-20" }), // Sunday
      bar({ timestamp: "2026-08-20" }), // 31-day jump back (unsorted + unusual)
      bar({ timestamp: "2026-09-02" }), // 19-day gap
    ]);
    expect(report.status).toBe("PASS");
    expect(report.warnings.some((w) => w.code === "WEEKEND_ROW")).toBe(true);
    expect(report.warnings.some((w) => w.code === "UNSORTED_INPUT")).toBe(true);
    expect(report.warnings.some((w) => w.code === "UNUSUAL_GAP")).toBe(true);
  });

  it("warns on short calendar gaps (possible holidays) without failing", () => {
    const report = validateMarketDataset([
      bar({ timestamp: "2026-09-21" }), // Monday
      bar({ timestamp: "2026-09-26" }), // +5 days → holiday-class gap
    ]);
    expect(report.status).toBe("PASS");
    expect(report.warnings.some((w) => w.code === "HOLIDAY_GAP")).toBe(true);
  });

  it("normalizes a passing dataset into sorted typed bars and rejects a failing one", () => {
    const ok = normalizeDataset([
      bar({ timestamp: "2026-09-22" }),
      bar({ timestamp: "2026-09-21" }),
    ]);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.bars.map((b) => b.timestamp)).toStrictEqual(["2026-09-21", "2026-09-22"]);
      expect(ok.bars[0].instrument).toBe("EURUSD");
    }
    const bad = normalizeDataset([bar({ open: undefined })]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.report.status).toBe("FAIL");
  });

  it("is deterministic: identical input yields identical reports", () => {
    const rows = [bar({ timestamp: "2026-09-21" }), bar({ timestamp: "2026-09-21", open: 1 }), bar({ timestamp: "x" })];
    expect(JSON.stringify(validateMarketDataset(rows))).toBe(JSON.stringify(validateMarketDataset(rows)));
  });
});
