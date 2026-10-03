/**
 * Phase 5 — Massive LIVE contract verification (server-side).
 *
 *   A. raw FX daily aggregates contract for C:EURUSD (HTTP, envelope, rows)
 *   B. the real MassiveAdapter parser over the live response
 *   C. the real domain quality gate over the adapter's bars
 * plus one deliberate contract-violation request to observe the live error
 * payload shape.
 *
 * Massive FX bars are QUOTE-derived (bid/ask), not executed trades — the
 * adapter must preserve that distinction in provenance/metadata; the probe
 * prints the boundary declaration verbatim. The AMBIGUOUS daily-boundary
 * classification is observed, never silently changed.
 */
import { MassiveAdapter } from "@/services/market/providers/massive";
import { normalizeDataset } from "@/domain/market/quality";

const key = process.env.MASSIVE_API_KEY;
if (!key || key.trim().length < 8) {
  console.log("RESULT: MISSING_SERVER_CREDENTIAL");
  process.exit(2);
}
const redact = (s: string) => s.split(key).join("***REDACTED***");

console.log("=== A. RAW CONTRACT: /v2/aggs/ticker/C:EURUSD/range/1/day ===");
const from = "2025-10-01";
const to = "2026-10-03";
const url = new URL(`https://api.massive.com/v2/aggs/ticker/C:EURUSD/range/1/day/${from}/${to}`);
const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${key}` } });
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
  console.log("status field:", JSON.stringify(body.status));
  const success = (body.status === "OK" || body.status === "DELAYED") && Array.isArray(body.results);
  if (!success) {
    console.log("ERROR_PAYLOAD:", redact(JSON.stringify(body)).slice(0, 400));
    console.log("RESULT: RAW_FAIL");
    process.exit(1);
  }
  const results = (body.results ?? []) as Record<string, unknown>[];
  console.log("results count:", results.length, "ticker:", body.ticker, "request_id:", typeof body.request_id);
  if (results.length > 0) {
    console.log("row keys:", Object.keys(results[0]));
    console.log("first row:", JSON.stringify(results[0]));
    console.log("last row:", JSON.stringify(results[results.length - 1]));
    const t = Number(results[results.length - 1].t);
    const iso = new Date(t).toISOString();
    const eastern = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(t));
    console.log("oldest t -> UTC:", iso, "| Eastern calendar date:", eastern);
    const ascending = results.every((r, i, a) => i === 0 || Number(a[i - 1].t) <= Number(r.t));
    console.log("results ascending by t:", ascending);
    const hasVw = "vw" in results[0];
    console.log("has v/vw (quote volume fields):", "v" in results[0], hasVw);
  }
}

console.log("=== B. REAL ADAPTER ===");
const ma = new MassiveAdapter({ apiKey: key });
console.log("verification:", ma.verification, "isEnabled:", ma.isEnabled());
const out = await ma.getBars({ instrument: "EURUSD", timeframe: "DAILY", range: "1y" });
if (!out.ok) {
  console.log("ADAPTER_FAILURE:", out.failure.kind, "|", out.failure.message);
  console.log("RESULT: ADAPTER_FAIL");
  process.exit(1);
}
const ds = out.dataset;
console.log("bars:", ds.bars.length, "first:", ds.bars[0]?.timestamp, "last:", ds.bars[ds.bars.length - 1]?.timestamp);
console.log("chronological strict:", ds.bars.every((b, i, a) => i === 0 || a[i - 1].timestamp < b.timestamp));
console.log("candleBoundary:", JSON.stringify(ds.candleBoundary));
console.log("retrievedAt:", ds.retrievedAt, "sourceMeta:", JSON.stringify(ds.sourceMeta));

console.log("=== C. QUALITY GATE ===");
const gate = normalizeDataset(ds.bars.map((b) => ({ ...b })), { expectedInstrument: "EURUSD" });
console.log("gate ok:", gate.ok, "errors:", gate.report.errors.length, "warnings:", (gate.report.warnings ?? []).length);
if (gate.report.errors.length > 0) console.log("error codes:", JSON.stringify(gate.report.errors.slice(0, 5)));
console.log("bar count after gate:", gate.bars.length);

console.log("=== D. LIVE ERROR PAYLOAD (from > to) ===");
const badUrl = new URL(`https://api.massive.com/v2/aggs/ticker/C:EURUSD/range/1/day/${to}/${from}`);
const badRes = await fetch(badUrl.toString(), { headers: { Authorization: `Bearer ${key}` } });
console.log("HTTP status:", badRes.status);
const badText = await badRes.text();
try {
  const bad = JSON.parse(badText) as Record<string, unknown>;
  console.log("error payload keys:", Object.keys(bad), "status:", JSON.stringify(bad.status), "error:", redact(String(bad.error ?? bad.message ?? "")).slice(0, 200));
} catch {
  console.log("error body:", redact(badText).slice(0, 300));
}

console.log("RESULT: RAW_OK ADAPTER_OK GATE_" + (gate.ok ? "OK" : "FAIL"));
