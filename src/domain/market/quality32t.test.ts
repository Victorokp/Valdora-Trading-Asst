/**
 * Quality-gate extension tests (32T Phase 7).
 *
 * The gate gained an OPTIONAL `expectedInstrument` check (and the
 * INSTRUMENT_MISMATCH error code). Backward compatibility is pinned: without
 * the option, reports are byte-identical to the 32F behavior.
 */
import { describe, expect, it } from "vitest";

import { normalizeDataset, validateMarketDataset, type RawBarInput } from "@/domain/market/quality";

const ROWS: readonly RawBarInput[] = [
  { instrument: "EURUSD", timeframe: "DAILY", timestamp: "2026-10-01", open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
  { instrument: "EURUSD", timeframe: "DAILY", timestamp: "2026-10-02", open: 1.15, high: 1.25, low: 1.1, close: 1.2 },
];

describe("expected-instrument enforcement", () => {
  it("passes when every row matches the expected instrument", () => {
    const report = validateMarketDataset(ROWS, { expectedInstrument: "EURUSD" });
    expect(report.status).toBe("PASS");
    expect(report.errors).toStrictEqual([]);
    expect(report.acceptedRows).toBe(2);
  });

  it("rejects rows for a different instrument with INSTRUMENT_MISMATCH", () => {
    const foreign = ROWS.map((r) => ({ ...r, instrument: "GBPUSD" }));
    const report = validateMarketDataset(foreign, { expectedInstrument: "EURUSD" });
    expect(report.status).toBe("FAIL");
    expect(report.errors.map((e) => e.code)).toStrictEqual(["INSTRUMENT_MISMATCH", "INSTRUMENT_MISMATCH"]);
    expect(report.acceptedRows).toBe(0);
  });

  it("normalizeDataset forwards the option and refuses mismatched datasets", () => {
    const foreign = ROWS.map((r) => ({ ...r, instrument: "GBPUSD" }));
    const gate = normalizeDataset(foreign, { expectedInstrument: "EURUSD" });
    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error("expected rejection");
    expect(gate.report.status).toBe("FAIL");
  });

  it("is backward compatible: without the option no instrument check runs", () => {
    const foreign = ROWS.map((r) => ({ ...r, instrument: "GBPUSD" }));
    const report = validateMarketDataset(foreign);
    expect(report.status).toBe("PASS");
    const gate = normalizeDataset(ROWS);
    expect(gate.ok).toBe(true);
  });
});
