/**
 * Phase 6 — Alpha Vantage LIVE FX daily contract verification (server-side).
 *
 * The adapter is hard-disabled (UNVERIFIED) so Part B is expected to refuse
 * until the raw contract (Part A) passes and the verification flag is flipped
 * through the verification workflow. This probe only OBSERVES the live
 * contract; it never changes the flag itself.
 *
 *   A. raw FX_DAILY contract (HTTP, Meta Data, Time Series FX (Daily))
 *   B. real AlphaVantageAdapter (currently expected to refuse: UNVERIFIED)
 *   C. deliberate error-contract request (invalid function -> Error Message)
 */
import { AlphaVantageAdapter } from "@/services/market/providers/alphaVantage";
import { normalizeDataset } from "@/domain/market/quality";

const key = process.env.ALPHAVANTAGE_API_KEY;
if (!key || key.trim().length < 8) {
  console.log("RESULT: MISSING_SERVER_CREDENTIAL");
  process.exit(2);
}
const redact = (s: string) => s.split(key).join("***REDACTED***");
const SERIES_KEY = "Time Series FX (Daily)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log("=== A. RAW CONTRACT: function=FX_DAILY EUR->USD ===");
const url = new URL("https://www.alphavantage.co/query");
url.searchParams.set("function", "FX_DAILY");
url.searchParams.set("from_symbol", "EUR");
url.searchParams.set("to_symbol", "USD");
url.searchParams.set("outputsize", "full");
url.searchParams.set("apikey", key);
const res = await fetch(url.toString());
console.log("HTTP status:", res.status);
const text = await res.text();
let body: Record<string, unknown> | null = null;
try {
  body = JSON.parse(text) as Record<string, unknown>;
} catch {
  console.log("NON_JSON_BODY:", redact(text).slice(0, 400));
}
let rawPass = false;
if (body) {
  console.log("top-level keys:", Object.keys(body));
  const hasSeries = typeof body[SERIES_KEY] === "object" && body[SERIES_KEY] !== null;
  const hasMeta = typeof body["Meta Data"] === "object" && body["Meta Data"] !== null;
  console.log(`has "${SERIES_KEY}":`, hasSeries, '| has "Meta Data":', hasMeta);
  if (!hasSeries) {
    console.log("NON_SERIES_PAYLOAD:", redact(JSON.stringify(body)).slice(0, 500));
  } else {
    const meta = body["Meta Data"] as Record<string, unknown>;
    console.log("meta keys:", Object.keys(meta));
    console.log("meta:", JSON.stringify(meta));
    const series = body[SERIES_KEY] as Record<string, Record<string, unknown>>;
    const dates = Object.keys(series);
    console.log("series entries:", dates.length, "newest:", dates[0], "oldest:", dates[dates.length - 1]);
    const newest = series[dates[0]];
    console.log("row keys:", Object.keys(newest));
    console.log("newest row:", JSON.stringify(newest));
    const ascending = dates.every((d, i) => i === 0 || dates[i - 1] <= d);
    const descending = dates.every((d, i) => i === 0 || dates[i - 1] >= d);
    console.log("date order: ascending=", ascending, "descending=", descending);
    rawPass = true;
  }
}

console.log("=== B. REAL ADAPTER (VERIFIED since 2026-10-03) ===");
await sleep(1100); // free tier documents 1 request per second
const av = new AlphaVantageAdapter({ apiKey: key });
console.log("verification:", av.verification, "isEnabled:", av.isEnabled());
const out = await av.getBars({ instrument: "EURUSD", timeframe: "DAILY", range: "1y" });
if (!out.ok) {
  console.log("ADAPTER_FAILURE:", out.failure.kind, "|", out.failure.message);
  console.log("RESULT: RAW_" + (rawPass ? "PASS" : "FAIL") + " ADAPTER_FAIL");
  process.exit(1);
}
const ds = out.dataset;
console.log("bars:", ds.bars.length, "first:", ds.bars[0]?.timestamp, "last:", ds.bars[ds.bars.length - 1]?.timestamp);
console.log("chronological strict:", ds.bars.every((b, i, a) => i === 0 || a[i - 1].timestamp < b.timestamp));
const weekend = ds.bars.filter((b) => {
  const d = new Date(b.timestamp + "T00:00:00Z").getUTCDay();
  return d === 0 || d === 6;
});
console.log("weekend-dated bars:", weekend.length, weekend.map((b) => b.timestamp).slice(0, 5));
console.log("candleBoundary:", JSON.stringify(ds.candleBoundary));
console.log("retrievedAt:", ds.retrievedAt, "sourceMeta:", JSON.stringify(ds.sourceMeta));
const gate = normalizeDataset(ds.bars.map((b) => ({ ...b })), { expectedInstrument: "EURUSD" });
console.log("gate ok:", gate.ok, "errors:", gate.report.errors.length, "warnings:", (gate.report.warnings ?? []).length);
if (gate.report.errors.length > 0) console.log("error codes:", JSON.stringify(gate.report.errors.slice(0, 5)));

console.log("=== C. ERROR CONTRACT (invalid function) ===");
await sleep(1100);
const badUrl = new URL("https://www.alphavantage.co/query");
badUrl.searchParams.set("function", "NOT_A_REAL_FUNCTION");
badUrl.searchParams.set("apikey", key);
const badRes = await fetch(badUrl.toString());
console.log("HTTP status:", badRes.status);
const badText = await badRes.text();
try {
  const bad = JSON.parse(badText) as Record<string, unknown>;
  console.log("error payload keys:", Object.keys(bad));
  for (const k of ["Error Message", "Information", "Note"]) {
    if (typeof bad[k] === "string") console.log(`${k}:`, redact(String(bad[k])).slice(0, 200));
  }
} catch {
  console.log("error body:", redact(badText).slice(0, 300));
}

console.log("RESULT: RAW_" + (rawPass ? "PASS" : "FAIL") + " ADAPTER_OK GATE_" + (gate.ok ? "OK" : "FAIL"));
