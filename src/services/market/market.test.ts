import { describe, expect, it } from "vitest";

import { UNPROVENANCED } from "@/domain/provenance/provenance";
import { INSTRUMENT_CATALOG, getCatalogEntry } from "@/services/market/catalog";
import {
  MarketDataServiceImpl,
  StaticMarketDataProvider,
  UnconfiguredMarketDataService,
} from "@/services/market";
import type { RawBarInput } from "@/domain/market/quality";

const FIXTURE_ROWS: readonly RawBarInput[] = [
  { instrument: "EURUSD", timeframe: "DAILY", timestamp: "2026-09-21", open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
  { instrument: "EURUSD", timeframe: "DAILY", timestamp: "2026-09-22", open: 1.15, high: 1.25, low: 1.12, close: 1.2 },
  { instrument: "EURUSD", timeframe: "DAILY", timestamp: "2026-09-23", open: 1.2, high: 1.26, low: 1.18, close: 1.22 },
];

describe("instrument catalog", () => {
  it("lists exactly the seven supported pairs", () => {
    expect(INSTRUMENT_CATALOG.map((e) => e.symbol)).toStrictEqual([
      "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCHF", "USDCAD",
    ]);
  });

  it("keeps EURUSD primary and research-backed", () => {
    const eurusd = getCatalogEntry("EURUSD");
    expect(eurusd?.role).toBe("PRIMARY");
    expect(eurusd?.researchLineage).toBe("PHASE21_31_EVIDENCE");
    expect(eurusd?.dataAvailability).toBe("HISTORICAL_DATA_PRESENT");
    expect(eurusd?.pipSize).toBe(0.0001);
  });

  it("states D1 availability factually: three pairs have data, three are not acquired", () => {
    expect(getCatalogEntry("GBPUSD")?.dataAvailability).toBe("HISTORICAL_DATA_PRESENT");
    expect(getCatalogEntry("USDJPY")?.dataAvailability).toBe("HISTORICAL_DATA_PRESENT");
    expect(getCatalogEntry("AUDUSD")?.dataAvailability).toBe("HISTORICAL_DATA_PRESENT");
    for (const symbol of ["NZDUSD", "USDCHF", "USDCAD"]) {
      const entry = getCatalogEntry(symbol);
      expect(entry?.dataAvailability).toBe("DATA_NOT_ACQUIRED");
      expect(entry?.dataProvenance).toBeUndefined();
      expect(entry?.note).toContain("not present in this repository");
    }
  });

  it("carries declared pip sizes for all seven pairs (registry mapping)", () => {
    for (const entry of INSTRUMENT_CATALOG) {
      expect(entry.pipSize).toBeDefined();
    }
    expect(getCatalogEntry("USDJPY")?.pipSize).toBe(0.01);
  });
});

describe("unconfigured market data service", () => {
  it("honestly reports NOT_CONFIGURED for every data request", async () => {
    const service = new UnconfiguredMarketDataService();
    const snapshot = await service.getLatestSnapshot("EURUSD");
    expect(snapshot.status).toBe("NOT_CONFIGURED");
    const bars = await service.getHistoricalBars("EURUSD", "DAILY", "1m");
    expect(bars.status).toBe("NOT_CONFIGURED");
    const status = await service.getDataSourceStatus();
    expect(status.status === "SUCCESS" && status.value.status).toBe("NOT_CONFIGURED");
    expect(status.status === "SUCCESS" && status.value.mode).toBe("UNKNOWN");
  });

  it("still serves the instrument catalog without a provider", async () => {
    const service = new UnconfiguredMarketDataService();
    const meta = await service.getInstrumentMetadata("EURUSD");
    expect(meta.status === "SUCCESS" && meta.value.symbol).toBe("EURUSD");
    const unknown = await service.getInstrumentMetadata("XAUUSD");
    expect(unknown.status).toBe("NOT_FOUND");
    const session = await service.getMarketStatus("EURUSD");
    expect(session.status === "SUCCESS" && session.value).toBe("UNKNOWN");
  });

  it("rejects unsupported timeframes before touching a provider", async () => {
    const service = new UnconfiguredMarketDataService();
    const result = await service.getHistoricalBars("EURUSD", "H1", "1d");
    expect(result.status).toBe("VALIDATION_ERROR");
  });
});

describe("static fixture provider (deterministic tests/demos)", () => {
  const provider = new StaticMarketDataProvider({ EURUSD: FIXTURE_ROWS });
  const service = new MarketDataServiceImpl(provider);

  it("serves gated, chronologically-sorted fixture bars", async () => {
    const bars = await service.getHistoricalBars("EURUSD", "DAILY", "1w");
    expect(bars.status).toBe("SUCCESS");
    if (bars.status === "SUCCESS") {
      expect(bars.value.map((b) => b.timestamp)).toStrictEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
    }
  });

  it("labels fixture data as HISTORICAL, never live", async () => {
    const status = await service.getDataSourceStatus();
    expect(status.status === "SUCCESS" && status.value.mode).toBe("HISTORICAL");
    const snapshot = await service.getLatestSnapshot("EURUSD");
    expect(snapshot.status).toBe("SUCCESS");
    if (snapshot.status === "SUCCESS") {
      const provenance = snapshot.value.provenance;
      expect(provenance).not.toBe(UNPROVENANCED);
      if (provenance !== UNPROVENANCED) {
        expect(provenance.notes).toContain("not a live quote");
      }
    }
  });

  it("builds the latest snapshot from the last bar only", async () => {
    const snapshot = await service.getLatestSnapshot("EURUSD");
    expect(snapshot.status === "SUCCESS" && snapshot.value.price?.value).toBe(1.22);
  });

  it("rejects a provider dataset that fails the quality gate", async () => {
    const badProvider = new StaticMarketDataProvider({
      EURUSD: [...FIXTURE_ROWS, { ...FIXTURE_ROWS[0] }], // duplicate timestamp
    });
    const badService = new MarketDataServiceImpl(badProvider);
    const result = await badService.getHistoricalBars("EURUSD", "DAILY", "1w");
    expect(result.status).toBe("VALIDATION_ERROR");
  });

  it("returns NOT_FOUND for instruments without fixtures", async () => {
    const result = await service.getHistoricalBars("NZDUSD", "DAILY", "1w");
    expect(result.status).toBe("NOT_FOUND");
  });
});
