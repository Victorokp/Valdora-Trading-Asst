# PHASE28_WALK_FORWARD_VALIDATION_REPORT.md

Primary instrument: **EURUSD**. Control: Phase-21 Golden Reference,
unchanged. All numbers from `phase28/results/` (hashes in
`PHASE28_STATISTICS.md`). Full 16-window table:
`PHASE28_WALK_FORWARD_RESULTS.csv`; OOS trades: `PHASE28_OOS_TRADES.csv`;
OOS equity: `PHASE28_OOS_EQUITY.csv`.

## 1. Walk-forward windows (§6)

| # | Train | Val | Test | Test tr | Test R | Test PF | Test WR% |
|---|---|---|---|---|---|---|---|
| 1 | 2004-2008 | 2009 | 2010 | 2 | +1.00 | 2.00 | 50.0 |
| 2 | 2005-2009 | 2010 | 2011 | 5 | +1.00 | 1.33 | 40.0 |
| 3 | 2006-2010 | 2011 | 2012 | 4 | +2.09 | 2.04 | 50.0 |
| 4 | 2007-2011 | 2012 | 2013 | 8 | +7.00 | 3.33 | 62.5 |
| 5 | 2008-2012 | 2013 | 2014 | 3 | −3.00 | 0.00 | 0.0 |
| 6 | 2009-2013 | 2014 | 2015 | 1 | +2.00 | n/a | 100.0 |
| 7 | 2010-2014 | 2015 | 2016 | 4 | +2.00 | 2.00 | 50.0 |
| 8 | 2011-2015 | 2016 | 2017 | 7 | +8.00 | 5.00 | 71.4 |
| 9 | 2012-2016 | 2017 | 2018 | 8 | +1.17 | 1.23 | 37.5 |
| 10 | 2013-2017 | 2018 | 2019 | 0 | 0.00 | n/a | — |
| 11 | 2014-2018 | 2019 | 2020 | 7 | −4.00 | 0.33 | 14.3 |
| 12 | 2015-2019 | 2020 | 2021 | 5 | −2.00 | 0.50 | 20.0 |
| 13 | 2016-2020 | 2021 | 2022 | 0 | 0.00 | n/a | — |
| 14 | 2017-2021 | 2022 | 2023 | 4 | +5.00 | 6.00 | 75.0 |
| 15 | 2018-2022 | 2023 | 2024 | 5 | +1.00 | 1.33 | 40.0 |
| 16 | 2019-2023 | 2024 | 2025 | 13 | +11.00 | 3.20 | 61.5 |

Train/validation columns are in the CSV. The strategy was not altered
between windows.

## 2. Test-only aggregate (§7)

76 trades · **total R +32.2552** · **PF 1.8064** · win rate 47.37% ·
average R +0.4244 · median R −1.00 · **max DD −12.00R** · maximum losing
streak 7 · profitable windows **11/16 (68.75%)**, losing 3, flat 2 (2019,
2022: zero signals).

## 3. Test-window distribution (§8)

Best window 2025 (+11.0R); worst 2020 (−4.0R); median window +1.08R; mean
+2.02R; std 4.00R; 68.75% positive. Concentration: the best window is
34.1% of cumulative test R; the best two are 58.9%. **Cumulative test R
excluding the best window: +21.26R; excluding the best two: +13.26R** —
positive without the strongest years, so performance does not hinge on one
or two windows (though 2025 is a strong contributor and 2019/2022 carry no
trades at all).

## 4. OOS equity curve (§9) — test trades only

Exit-ordered cumulative closed-R over the 76 OOS trades: terminal **+32.26R**,
max DD **−12.00R**, longest losing streak **7**, PF **1.81**. Curve:
`PHASE28_OOS_EQUITY.csv`. (Its −12R trough occurs in the 2019–2021 stretch.)

## 5. Temporal stability, per test year (§10–11)

| Year | Tr | W | L | WR% | PF | R | maxDD | small-sample |
|---|---|---|---|---|---|---|---|---|
| 2010 | 2 | 1 | 1 | 50.0 | 2.00 | +1.00 | −1 | YES |
| 2011 | 5 | 2 | 3 | 40.0 | 1.33 | +1.00 | −2 | YES |
| 2012 | 4 | 2 | 2 | 50.0 | 2.04 | +2.09 | −1 | YES |
| 2013 | 8 | 5 | 3 | 62.5 | 3.33 | +7.00 | −3 | YES |
| 2014 | 3 | 0 | 3 | 0.0 | 0.00 | −3.00 | −2 | YES |
| 2015 | 1 | 1 | 0 | 100.0 | — | +2.00 | 0 | YES |
| 2016 | 4 | 2 | 2 | 50.0 | 2.00 | +2.00 | −1 | YES |
| 2017 | 7 | 5 | 2 | 71.4 | 5.00 | +8.00 | −2 | YES |
| 2018 | 8 | 3 | 5 | 37.5 | 1.23 | +1.17 | −5 | YES |
| 2019 | 0 | — | — | — | — | 0.00 | — | — (no signals) |
| 2020 | 7 | 1 | 6 | 14.3 | 0.33 | −4.00 | −4 | YES |
| 2021 | 5 | 1 | 4 | 20.0 | 0.50 | −2.00 | −2 | YES |
| 2022 | 0 | — | — | — | — | 0.00 | — | — (no signals) |
| 2023 | 4 | 3 | 1 | 75.0 | 6.00 | +5.00 | −1 | YES |
| 2024 | 5 | 2 | 3 | 40.0 | 1.33 | +1.00 | −1 | YES |
| 2025 | 13 | 8 | 5 | 61.5 | 3.20 | +11.00 | −3 | no |

Descriptive reading (not a judgment): 10 of 14 traded years positive;
2014 and 2020–2021 negative; most years carry **few trades** — only 2025
reaches 13. Per §11, no strong conclusion is drawn from any single year.

## 6. Regime-conditional OOS descriptives (§12, entry-time causal)

- Volatility (ATR/price): low (< 0.5%) 5 tr −2.00R PF 0.50 · mid 63 tr
  +30.26R PF 1.95 · high (> 1.0%) 8 tr +4.00R PF 2.00.
- ATR percentile (100-bar, signal-inclusive): below-33rd 39 tr +6.09R PF
  1.25 · 33–67th 18 tr +18.17R PF 4.03 · above-67th 19 tr +8.00R PF 1.80 —
  consistent with Phase 27: mid-volatility entries carry most of the edge;
  low-vol entries are the weakest cohort.
- EMA20−EMA50 gap (ATR units): narrow 26 tr +4.00R · mid 25 tr +8.26R ·
  wide 25 tr +20.00R — OOS, wider daily trend separation performed better
  (descriptive only; NOT adopted as a filter).
- Breakout magnitude and weekly separation: mild variations, no decisive
  pattern; full tables in `phase28_statistics.json`.
- These are descriptions of where the edge lived, **not** filters.

## 7. Cross-pair secondary validation (§14, unchanged logic)

| Pair | Full history | OOS 2010–2025 (entry-year) |
|---|---|---|
| GBPUSD | 152 tr, +4.40R, PF 1.04 | 101 tr, +19.00R, PF 1.31 |
| USDJPY | 118 tr, +5.00R, PF 1.06 | 88 tr, +5.00R, PF 1.09 |
| AUDUSD | 123 tr, −8.98R, PF 0.89 | 73 tr, −16.00R, PF 0.70 |

Secondary reading: weakly positive on GBP/JPY, negative on AUD. **Transfer
to other pairs is not demonstrated**; this does not change the EURUSD
primary result and the pairs are never pooled into it.

## 8. C3 comparison (§15, rejected candidate, untouched)

Control OOS: 76 tr, +32.26R, PF 1.81, maxDD −12. C3 subset (57 of those
trades pass its frozen ATR-percentile floor): +30.17R, PF 2.08, maxDD −7;
the 19 excluded trades carried only +2.09R. Reported for the record only:
C3 remains a rejected candidate, unmodified, not adopted.

## 9. Bootstrap (§22, seed 20280926, 10,000 resamples)

- mean R: 95% interval [**+0.105**, +0.745], median 0.424
- total R: 95% interval [**+8.00**, +56.60], median +32.26
- max DD: 95% interval [−13.0, −3.0]
- 0.79% of resamples produced negative total R.
These are descriptive uncertainty estimates on the observed OOS
distribution — **not** predictions that future performance will fall inside
them, and not used to modify anything.

## 10. Monte Carlo order test (§24, seed 20280927, 10,000 permutations)

Median max DD **−6.0R**; p5 −10.0R; p95 −4.0R; median longest losing
streak 6; p95 9; terminal R order-invariant (+32.26R). The realized −12R
OOS drawdown is a worse-than-typical ordering (~5th percentile of
permutations), not an anomaly of the trade set.

## 11. Answers to the primary validation questions (§26)

- **Q1 — positive aggregate across independent test windows?** Yes: +32.26R
  pooled across 76 window-test trades, 11/16 windows ≥ 0 (8 positive, 2
  flat-zero-signal, 5 losing... 3 losing + 2 flat). PF 1.81 OOS.
- **Q2 — stability across time?** Moderate: 10/14 traded years positive;
  negative stretch 2020–2021; two years with no signals at all; edge not
  uniform.
- **Q3 — dependence on few trades?** Low-to-moderate: removing the best 10
  OOS trades still leaves +12.00R; best window contributes 34.1%; top
  winner 3% of gross profit. But yearly samples are small (most years < 10
  trades).
- **Q4 — regime dependence?** Yes, materially: mid-volatility entries carry
  most of the OOS edge; the widest daily-trend-separation tercile
  contributed +20R of the +32R. The strategy is not regime-blind.
- **Q5 — evidence outside EURUSD?** Weak: GBP/JPY marginally positive,
  AUDUSD negative OOS. Transfer not demonstrated.
- **Q6 — OOS drawdown distribution?** Realized −12R; permutation median
  −6R, p5 −10R; bootstrap 95% band [−13, −3]. The realized figure is an
  unfavorable ordering, not an outlier of the trade set.
- **Q7 — does OOS differ from the historical benchmark?** No material
  contradiction: OOS PF 1.81 vs full-history 1.49; win rate 47.4% vs 42.6%;
  same binary R structure (≈ −1 / +2), same maxDD −12R, same 7-loss streak.
  The 2010–2025 slice simply performed better than the full history,
  consistent with the 2010–2025 years also being among the stronger
  calendar years in-sample.
- **Q8 — leakage or implementation concerns?** None found: 76/76 signals
  reproduce from truncated data; 76/76 entries exact; boundaries exact;
  hashes unchanged; determinism verified.

**Decision state: STATE A — see PHASE28_DECISION.md.**
