import { describe, expect, it } from "vitest";

import { isValidBar, validateBar, type MarketBar } from "@/domain/market/bar";
import {
  SUPPORTED_TIMEFRAMES,
  barIntervalSeconds,
  timeframeCategory,
  validateTimeframe,
} from "@/domain/market/timeframe";

const baseBar: MarketBar = {
  instrument: "EURUSD",
  timeframe: "DAILY",
  timestamp: "2026-09-25",
  open: 1.1,
  high: 1.2,
  low: 1.0,
  close: 1.15,
};

describe("timeframe validation", () => {
  it("supports daily and weekly as the registered set", () => {
    expect(SUPPORTED_TIMEFRAMES).toStrictEqual(["DAILY", "WEEKLY"]);
  });

  it("accepts canonical daily/weekly timeframes", () => {
    expect(validateTimeframe("DAILY")).toStrictEqual({ ok: true, timeframe: "DAILY" });
    expect(validateTimeframe("WEEKLY")).toStrictEqual({ ok: true, timeframe: "WEEKLY" });
  });

  it("knows intraday slots exist but are not registered yet", () => {
    expect(validateTimeframe("H1")).toStrictEqual({ ok: false, reason: "UNSUPPORTED_TIMEFRAME" });
    expect(timeframeCategory("H1")).toBe("INTRADAY");
  });

  it("rejects unknown timeframes", () => {
    expect(validateTimeframe("2H")).toStrictEqual({ ok: false, reason: "UNKNOWN_TIMEFRAME" });
  });

  it("exposes deterministic bar intervals", () => {
    expect(barIntervalSeconds("DAILY")).toBe(86_400);
    expect(barIntervalSeconds("WEEKLY")).toBe(604_800);
  });
});

describe("market bar OHLC validation", () => {
  it("accepts a structurally valid bar", () => {
    expect(validateBar(baseBar)).toStrictEqual([]);
    expect(isValidBar(baseBar)).toBe(true);
  });

  it("reports all impossible relationships present (deterministic, ordered)", () => {
    const bad = { ...baseBar, high: 0.9, low: 1.0 };
    expect(validateBar(bad)).toStrictEqual(["HIGH_BELOW_LOW", "OPEN_OUT_OF_RANGE", "CLOSE_OUT_OF_RANGE"]);
  });

  it("rejects a high/low inversion regardless of open/close placement", () => {
    const bad = { ...baseBar, high: 1.0, low: 1.05, open: 1.02, close: 1.03 };
    expect(validateBar(bad)).toContain("HIGH_BELOW_LOW");
    const bad2 = { ...baseBar, high: 1.0, low: 1.05 };
    const problems = validateBar(bad2);
    expect(problems[0]).toBe("HIGH_BELOW_LOW");
    expect(problems).toContain("OPEN_OUT_OF_RANGE");
    expect(problems).toContain("CLOSE_OUT_OF_RANGE");
  });

  it("rejects open outside the high/low range", () => {
    const bad = { ...baseBar, open: 1.3 };
    expect(validateBar(bad)).toStrictEqual(["OPEN_OUT_OF_RANGE"]);
  });

  it("rejects close outside the high/low range", () => {
    const bad = { ...baseBar, close: 0.5 };
    expect(validateBar(bad)).toStrictEqual(["CLOSE_OUT_OF_RANGE"]);
  });

  it("rejects negative and non-finite prices deterministically", () => {
    expect(validateBar({ ...baseBar, open: -1 })).toStrictEqual(["NEGATIVE_PRICE"]);
    expect(validateBar({ ...baseBar, high: Number.NaN })).toStrictEqual(["NON_FINITE_PRICE"]);
  });

  it("rejects negative volume but accepts missing volume", () => {
    expect(validateBar({ ...baseBar, volume: -5 })).toStrictEqual(["NEGATIVE_VOLUME"]);
    expect(validateBar(baseBar)).toStrictEqual([]);
  });

  it("rejects an empty timestamp", () => {
    expect(validateBar({ ...baseBar, timestamp: "" })).toStrictEqual(["MISSING_TIMESTAMP"]);
  });
});
