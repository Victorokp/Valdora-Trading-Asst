# PHASE27_BASELINE_DIAGNOSTICS.md

All numbers derive from the byte-identical Golden Reference ledger
(115 trades, SHA-256 `30d22be4…f70d0`). Descriptive only — no filter, no
optimization. Full machine-readable results:
`phase27/results/phase27_diagnostics.json`.

## 27-A — Baseline diagnostic (control)

- Reproduction: ledger byte-identical (verified by SHA-256 before any
  diagnostic ran). Trades 115; win rate 42.6087%; PF 1.4889; total R
  +32.2644; maxDD −12.00 (closed-R, exit-date order).
- Outcome counts: 66 stop, 46 target, 3 gap_target, 0 gap_stop,
  0 open_at_data_end.
- Enriched trade table (27-A columns): trade-by-trade R, dates, holding
  period (days and bars), signal ATR, stop/target distances, exit reason,
  daily signal-condition flags, weekly EMA10/20 + separation, ATR
  percentile, breakout magnitude, candle geometry, concurrency count,
  win/loss streaks. → `phase27/results/phase27_enriched_trades.csv`.
- Concurrency: max 6 simultaneous positions; average 1.7478.

## 27-B — Return distribution

- mean R +0.2806; median R −1.00; std 1.4928; skewness +0.3033.
- Percentiles (R): p5/p10/p25/p50 = −1.00; p75/p90/p95 = +2.00 — the
  distribution is effectively binary (≈ −1 or ≈ +2), consistent with the
  1:2 stop/target structure.
- Concentration of gross profit: top-1 winner 2.20%, top-3 6.38%, top-5
  10.45%, top-10 20.62% — no single-trade dependence.
- Total R after removing the best N trades: top1 → +30.10; top3 → +26.00;
  top5 → +22.00; top10 → +12.00 — **positive in every case**.
- Win trades contribute +304.56% of total R; losing trades −204.56% (net
  +100%).

**Finding: the +32.26R is broadly distributed, not a few lucky trades.**

## 27-C — Temporal stability

- Calendar years (exit-year buckets, 2004–2026, 21 years): 14/21 positive.
  Best 2025 (+11.0R, 13 trades); worst 2020 (−4.0R, 7 trades). Full table in
  the diagnostics JSON (`C_temporal_stability.year`).
- Quarters and months: full tables in the JSON; no period was selected or
  excluded anywhere in Phase 27.
- Rolling 12-month windows (251 windows): 62/251 negative (24.7%); worst
  window ends 2021-07 (−6.0R).

**Finding: positive expectancy is present across most, not all, periods;
2020–2021 is the weakest stretch.**

## 27-D — Market-regime descriptives (entry-available information only)

Weekly EMA10−EMA20 separation (quartiles):
q1 low 29 tr +10.09R PF 1.63 · q2 29 tr +16.17R PF 2.15 · q3 28 tr −3.99R
PF 0.80 · q4 high 29 tr +10.00R PF 1.63 — **non-monotonic**; the strongest
quartile is q2, not the most extended trend.

Trailing ATR percentile (100-bar, signal-inclusive):
below-33rd 53 tr +10.09R PF 1.32 · 33–67th 33 tr +21.18R PF 2.41 ·
above-67th 29 tr +1.00R PF 1.05 — mid-volatility entries carry the edge;
extreme volatility adds nothing.

Breakout magnitude (tertiles): q1 +6.00R · q2 +16.18R · q3 +10.09R —
mild non-monotonicity; no clean dose-response.

EMA20−EMA50 gap and candle range: full tables in the JSON; no monotonic
edge concentration.

**Finding: no entry-available variable shows a monotonic quality gradient;
the C2 hypothesis (trend-strength floor) was rightly rejected by its gate.**

## 27-E — Multi-currency transfer (same logic, no per-pair tuning)

| Pair | Trades | PF | Total R | MaxDD | Win rate | Avg R | Positive years |
|---|---|---|---|---|---|---|---|
| GBPUSD | 152 | 1.044 | +4.40R | −16R | 34.2% | +0.029 | 8/20 |
| USDJPY | 118 | 1.065 | +5.00R | −16R | 34.7% | +0.042 | 7/20 |
| AUDUSD | 123 | 0.894 | −8.98R | −23R | 30.9% | −0.073 | 7/20 |

Cross-check: these exactly match the historical Phase-23 reference numbers
(152/1.04/+4.40; 118/1.06/+5.00; 123/0.89/−8.98) — the Golden Reference
transfers byte-consistently with the historical cross-pair record.

**Finding: the signal is materially weaker off EUR/USD; EUR/USD performance
is partly pair-specific. Transfer is not demonstrated.**

## 27-F — Execution-friction sensitivity (predefined grid; control = 1.5)

| Pips | Trades | Total R | PF | Win rate |
|---|---|---|---|---|
| 0.0 | 115 | +35.31 | 1.543 | 43.5% |
| 0.5 | 115 | +35.30 | 1.543 | 43.5% |
| 1.0 | 115 | +35.28 | 1.543 | 43.5% |
| 1.5 (control) | 115 | +32.26 | 1.489 | 42.6% |
| 2.0 | 115 | +32.25 | 1.489 | 42.6% |
| 3.0 | 115 | +32.22 | 1.488 | 42.6% |
| 4.0 | 115 | +29.19 | 1.436 | 41.7% |

**Finding: degradation is gradual; the edge survives 4 pips of friction
(+29.19R, PF 1.44). Trade count is friction-invariant (entry timing shifts
only when fills cross stop/target levels).**

## 27-G — Exit distribution

| Outcome | Trades | Total R | % of total R | Avg holding (days) |
|---|---|---|---|---|
| stop | 66 | −66.00 | −204.6% | 5.64 |
| target | 46 | +92.00 | +285.1% | 11.30 |
| gap_target | 3 | +6.26 | +19.4% | 8.67 |
| gap_stop | 0 | — | — | — |
| open_at_data_end | 0 | — | — | — |

**Finding: the edge is exactly the 1:2 bracket arithmetic (42.6% of trades
reaching +2R vs −1R per loss). Signal selection decides *which* trades
occur; the target/stop structure converts them. No exit modification is
indicated by this evidence.**

## 27-H — Position concurrency

- 52/115 trades overlapped another position; max 6 concurrent; mean 1.75.
- R by concurrency level at entry: 1 → 63 trades, +18.26R, PF 1.51,
  maxDD −5; 2 → 31, −7.00R, PF 0.70, maxDD −14; 3 → 12, +9.00R, PF 2.80;
  4+ → 9, +12.00R, PF 7.00.
- Diagnostic single-position greedy subset (earliest-entry non-overlapping
  selection of the SAME ledger): 84 trades, +27.26R, PF 1.58, maxDD −6.0.
  (Diagnostic only; the control is unchanged.)

**Finding: the −14R cluster sits in level-2 concurrency, yet levels 3–4+
contribute strongly; a naive concurrency cap is not supported. Both cap
candidates (C1, C4) were tested and rejected by the pre-registered
validation gate.**

## 27-I — Trade-order randomization (10,000 permutations, seed 20260926)

- Terminal R is order-invariant: +32.2644.
- maxDD percentiles across orderings: p5 −14.0 · p25 −11.0 · median −9.0 ·
  p75 −7.0 · p95 −6.0. The historical ordering's −12.00 sits at ≈ the 85th
  percentile of unfavorable orderings (14.68% of permutations were worse).
- Longest losing streak: actual 7 (corrected value; an earlier run printed a
  buggy 1 due to a grouping error, fixed and re-run); random-order median 7,
  p95 11.

**Finding: −12R is an unfavorable-but-plausible ordering, not an anomaly;
risk planning should use the permutation median (−9R) to p5 (−14R) band.**

## 27-J — Walk-forward descriptive (16 windows, anchors 2004–2019)

Test-window total R by test year 2010–2025:
1.0, 1.0, 2.09, 7.0, −3.0, 2.0, 2.0, 8.0, 1.17, 0.0, −4.0, −2.0, 0.0, 5.0,
1.0, 11.0 → 11/16 windows ≥ 0 (8 positive, 3 flat, 5 negative).
Pooled test years 2010–2025: 76 trades, +32.26R, PF 1.81, maxDD −12.0.
Full per-window train/val/test table in the diagnostics JSON.

**Finding: test-window performance is broadly consistent with expectancy;
no re-optimization was performed inside any window.**
