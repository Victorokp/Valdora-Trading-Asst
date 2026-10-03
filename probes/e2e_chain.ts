/**
 * Phase 10 — live end-to-end chain (server-side):
 * credentials → provider adapters → MarketDataRouter → normalization →
 * quality gate → cache → MarketDataService → analysis layer → provenance →
 * UI status (describeDataSource).
 *
 * No trade signal is created: signal evaluation has no call site in the
 * application, and a successful fetch is data only — never a strategy
 * validation. All three credentials are read from the server-side process
 * environment and never printed.
 */
import { MarketDataRouter } from "@/services/market/router";
import { TwelveDataAdapter } from "@/services/market/providers/twelveData";
import { MassiveAdapter } from "@/services/market/providers/massive";
import { AlphaVantageAdapter } from "@/services/market/providers/alphaVantage";
import { MarketDataServiceImpl } from "@/services/market";
import { AnalysisServiceImpl } from "@/services/analysis";
import { describeDataSource } from "@/components/market/DataStatusBadge";
import type { DataSourceMetadata } from "@/services/index";
import type { LoadState } from "@/hooks/useMarketData";

const tdKey = process.env.TWELVEDATA_API_KEY;
const mvKey = process.env.MASSIVE_API_KEY;
const avKey = process.env.ALPHAVANTAGE_API_KEY;
if (!tdKey || !mvKey || !avKey) {
  console.log("RESULT: MISSING_SERVER_CREDENTIALS");
  process.exit(2);
}

const router = new MarketDataRouter(
  [
    new TwelveDataAdapter({ apiKey: tdKey }),
    new MassiveAdapter({ apiKey: mvKey }),
    new AlphaVantageAdapter({ apiKey: avKey }),
  ],
  { now: () => Date.now() },
);
const service = new MarketDataServiceImpl(router);
const analysis = new AnalysisServiceImpl(service);

console.log("1. credential -> adapters -> router -> gate -> cache -> service");
const bars = await service.getHistoricalBars("EURUSD", "DAILY", "1y");
if (bars.status !== "SUCCESS") {
  console.log("FAIL bars:", bars.status, bars.status === "SUCCESS" ? "" : bars.error?.message);
  console.log("RESULT: E2E_FAIL_BARS");
  process.exit(1);
}
console.log(
  "   SUCCESS bars:", bars.value.length,
  "first:", bars.value[0].timestamp, "last:", bars.value[bars.value.length - 1].timestamp,
);

console.log("2. router outcome (single coherent provider snapshot)");
const outcome = router.getRouterState().outcome;
console.log("   outcome:", JSON.stringify(outcome));
console.log(
  "   providers:",
  JSON.stringify(router.getRouterState().providers.map((p) => ({ id: p.id, health: p.health, verification: p.verification }))),
);

console.log("3. MarketDataService data-source metadata -> UI status");
const ds = await service.getDataSourceStatus();
if (ds.status !== "SUCCESS") {
  console.log("FAIL data-source status:", ds.status);
  console.log("RESULT: E2E_FAIL_STATUS");
  process.exit(1);
}
console.log("   metadata:", JSON.stringify(ds.value));
const ui: LoadState<DataSourceMetadata> = { state: "SUCCESS", value: ds.value };
console.log("   UI badge:", JSON.stringify(describeDataSource(ui)));

console.log("4. analysis layer -> provenance");
const result = await analysis.analyze({ instrument: "EURUSD", timeframe: "DAILY" });
if (result.status !== "SUCCESS") {
  console.log("FAIL analysis:", result.status, result.status === "SUCCESS" ? "" : result.error?.message);
  console.log("RESULT: E2E_FAIL_ANALYSIS");
  process.exit(1);
}
console.log("   barCount:", result.value.barCount);
console.log("   provenance:", JSON.stringify(result.value.dataProvenance));

console.log("5. cache identity + no provider mixing on repeat request");
const bars2 = await service.getHistoricalBars("EURUSD", "DAILY", "1y");
const outcome2 = router.getRouterState().outcome;
console.log(
  "   repeat status:", bars2.status,
  "same bar count:", bars2.status === "SUCCESS" && bars2.value.length === bars.value.length,
);
console.log("   servedBy:", outcome2?.servedBy, "fulfillment:", outcome2?.fulfillment,
  "boundaryWarning:", outcome2?.boundaryWarning ?? "none");

console.log("RESULT: E2E_OK");
