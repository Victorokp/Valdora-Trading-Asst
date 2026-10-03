/**
 * Phase 4 — Twelve Data LIVE contract verification (server-side).
 *
 * Runs three checks with the server-side credential (read from the process
 * environment, never printed):
 *   A. raw /time_series contract (HTTP status, envelope, meta, values rows)
 *   B. the real TwelveDataAdapter parser over the live response
 *   C. the real domain quality gate over the adapter's bars
 * plus one deliberate contract-violation request to observe the live error
 * payload shape.
 *
 * RESEARCH_DAILY_BOUNDARY stays AMBIGUOUS unless this probe captures
 * genuinely new evidence; evidence is printed, never silently applied.
 */
import { TwelveDataAdapter } from "@/services/market/providers/twelveData";
import { normalizeDataset } from "@/domain/market/quality";

const key = process.env.TWELVEDATA_API_KEY;
if (!key || key.trim().length < 8) {
  console.log("RESULT: MISSING_SERVER_CREDENTIAL");
  process.exit(2);
}
const redact = (s: string) => s.split(key).join("***REDACTED***");

console.log("=== A. RAW CONTRACT: /time_series EUR/USD 1day ===");
const url = new URL("https://api.twelvedata.com/time_series");
url.searchParams.set("symbol", "EUR/USD");
url.searchParams.set("interval", "1day");
url.searchParams.set("outputsize", "200");
const res = await fetch(url.toString(), { headers: { Authorization: `apikey ${key}` } });
console.log("HTTP status:", res.status);
const text = await res.text();
let body: Record<string, unknown> | null = null;
try {
  body = JSON.parse(text) as Record<string, unknown>;
} catch {
  console.log("NON_JSON_BODY:", redact(text).slice(0, 400));
}
if (body) {
  console.log("top-level keys:", Object.keys(body));
  if (body.status === "error") {
    console.log("ERROR_PAYLOAD:", JSON.stringify({ code: body.code, message: redact(String(body.message)), status: body.status }));
    console.log("RESULT: RAW_FAIL");
    process.exit(1);
  }
  const meta = (body.meta ?? {}) as Record<string, unknown>;
  console.log("meta keys:", Object.keys(meta));
  console.log("meta:", JSON.stringify(meta));
  const values = (body.values ?? []) as Record<string, unknown>[];
  console.log("values count:", values.length);
  console.log("row keys:", values[0] ? Object.keys(values[0]) : null);
  if (values.length > 0) {
    console.log("first row (newest?):", JSON.stringify(values[0]));
    console.log("last row:", JSON.stringify(values[values.length - 1]));
    const dts = values.map((v) => String(v.datetime));
    const ascending = dts.every((d, i) => i === 0 || dts[i - 1] <= d);
    const descending = dts.every((d, i) => i === 0 || dts[i - 1] >= d);
    console.log("order: ascending=", ascending, "descending=", descending);
    const allDateOnly = dts.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    console.log("all datetimes date-only:", allDateOnly);
    const newest = String(values[0].datetime);
    const weekday = new Date(newest + "T00:00:00Z").toUTCString().slice(0, 3);
    console.log("newest datetime:", newest, "weekday:", weekday);
    console.log("meta has exchange/timezone field:", "exchange_timezone" in meta || "timezone" in meta || "exchange" in meta);
  }
}

console.log("=== B. REAL ADAPTER ===");
const td = new TwelveDataAdapter({ apiKey: key });
console.log("verification:", td.verification, "isEnabled:", td.isEnabled());
const out = await td.getBars({ instrument: "EURUSD", timeframe: "DAILY", range: "1y" });
if (!out.ok) {
  console.log("ADAPTER_FAILURE:", out.failure.kind, "|", out.failure.message);
  console.log("RESULT: ADAPTER_FAIL");
  process.exit(1);
}
const ds = out.dataset;
console.log("bars:", ds.bars.length, "first:", ds.bars[0]?.timestamp, "last:", ds.bars[ds.bars.length - 1]?.timestamp);
console.log("provider timestamps verbatim + chronological:",
  ds.bars.every((b, i, a) => i === 0 || a[i - 1].timestamp < b.timestamp));
console.log("candleBoundary:", JSON.stringify(ds.candleBoundary));
console.log("retrievedAt:", ds.retrievedAt, "sourceMeta:", JSON.stringify(ds.sourceMeta));
console.log("providerId:", ds.providerId, "label:", ds.providerLabel);

console.log("=== C. QUALITY GATE ===");
const gate = normalizeDataset(ds.bars.map((b) => ({ ...b })), { expectedInstrument: "EURUSD" });
console.log("gate ok:", gate.ok, "errors:", gate.report.errors.length, "warnings:", (gate.report.warnings ?? []).length);
if (gate.report.errors.length > 0) console.log("error codes:", JSON.stringify(gate.report.errors.slice(0, 5)));
console.log("bar count after gate:", gate.bars.length);

console.log("=== D. LIVE ERROR PAYLOAD (bad interval) ===");
const badUrl = new URL("https://api.twelvedata.com/time_series");
badUrl.searchParams.set("symbol", "EUR/USD");
badUrl.searchParams.set("interval", "1definitely-not-an-interval");
badUrl.searchParams.set("outputsize", "5");
const badRes = await fetch(badUrl.toString(), { headers: { Authorization: `apikey ${key}` } });
console.log("HTTP status:", badRes.status);
const badText = await badRes.text();
try {
  const bad = JSON.parse(badText) as Record<string, unknown>;
  console.log("error payload:", JSON.stringify({ code: bad.code, message: redact(String(bad.message ?? "")), status: bad.status }));
} catch {
  console.log("error body:", redact(badText).slice(0, 300));
}

console.log("RESULT: RAW_OK ADAPTER_OK GATE_" + (gate.ok ? "OK" : "FAIL"));
