# PHASE29_ROBUSTNESS_REPORT.md

Phase 29 — Robustness & Stress Testing of the Phase-21 Golden Reference.
Falsification attempt; the control is untouched
(`phase21_historical_reference.py`, SHA-256
`b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95`) on
`eurusd_d.csv` (SHA-256
`e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52`);
historical ledger SHA-256
`30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`.
All experiments were pre-registered in `PHASE29_EXPERIMENT_REGISTRY.md`
before execution. Full result tables: `PHASE29_STRESS_RESULTS.csv` and the
family CSVs. Decision: `PHASE29_DECISION.md`.

## Control (§5, frozen)

115 trades · 49W/66L · WR 42.6087% · gross +98.2644R / −66.0000R ·
**PF 1.4889** · **total +32.2644R** · avg +0.2806R · **maxDD −12.00R** ·
max losing streak 7 · 11/16 profitable test windows ·
OOS(2010–2025): 76 trades, +32.2552R, PF 1.8064, WR 47.37%, maxDD −12.00R.

## Executive Summary (§24)

**The Golden Reference survived the pre-registered stress battery.** The
edge degrades smoothly and predictably under every adverse family; no
reasonable perturbation flips the sign of the evidence, and no single
implementation detail carries the result. The one material fragility found
is **entry-timing dependence**: the edge decays fast once entry is delayed
past the signal bar, and is **exhausted by +2 bars**. Under the
pre-registered failure definitions this is a robustness statement about
execution urgency, not a collapse of the evidence — the control itself is
untouched. No experiment was selected, combined, or improved after the
fact. **No numerical score is created; the decision document maps these
findings to exactly one pre-registered state.**

## Execution Stress (§A)

| Experiment | Trades | Total R | PF | WR% | maxDD | Reading |
|---|---|---|---|---|---|---|
| 0 pips friction | 115 | +35.31 | 1.543 | 43.48 | −12 | upper anchor |
| **1.5 pips (control)** | 115 | **+32.26** | **1.489** | **42.61** | **−12** | control |
| 3 pips | 115 | +32.22 | 1.488 | 42.61 | −12 | HOLDS |
| 4 pips | 115 | +29.19 | 1.436 | 41.74 | −12 | HOLDS |
| 5 pips | 115 | +26.17 | 1.385 | 40.87 | −12 | HOLDS |
| 6 pips | 115 | +23.14 | 1.335 | 40.00 | −13 | HOLDS (degraded) |
| +0.5 pip slippage | 115 | +32.25 | 1.489 | 42.61 | −12 | HOLDS |
| +1.0 pip slippage | 115 | +32.23 | 1.488 | 42.61 | −12 | HOLDS |
| +2.0 pip slippage | 115 | +32.20 | 1.488 | 42.61 | −12 | HOLDS |

Deterioration is roughly linear (~1.05R per extra pip) with **no
break-even region inside the tested grid** — total R is still +23.1R and PF
1.34 at 6 pips. Adverse slippage is nearly neutral because the bracket is
ATR-scaled: extra entry cost widens both stop and target by the same
absolute amount, so R is almost invariant (only friction in *pips*, which
is small relative to ATR, moves R). PF stays above 1.33 in every case.

## Entry Delay (§B)

| Experiment | Trades | Total R | PF | WR% | maxDD |
|---|---|---|---|---|---|
| Control (next-open) | 115 | +32.26 | 1.489 | 42.61 | −12 |
| +1 bar | 115 | +20.04 | 1.286 | 39.13 | −18 |
| +2 bars | 115 | +2.00 | 1.026 | 33.91 | −17 |

**The most sensitive axis found.** A one-bar delay removes ~38% of total R
(PF 1.29); a two-bar delay removes ~94% (PF 1.03, effectively
break-even). The breakout-confirmation signal decays immediately after the
confirming day. Pre-registered interpretation: "FRAGILE if +1 bar flips
negative" — it does not flip (still +20R), so the family reads
DEGRADED-BUT-POSITIVE at +1 bar and FRAGILE at +2 bars. Execution urgency
is a property of the strategy that any live deployment must respect; it is
documented, not repaired.

## Exit Stress (§C)

| Experiment | Trades | Total R | PF | maxDD |
|---|---|---|---|---|
| Control | 115 | +32.26 | 1.489 | −12.00 |
| Adverse 0.5 pip on stop exits | 115 | +31.65 | 1.477 | −12.10 |
| Adverse 0.5 pip on target exits | 115 | +31.65 | 1.477 | −12.10 |
| Adverse 1.0 pip on stop exits | 115 | +31.03 | 1.465 | −12.21 |
| Adverse 1.0 pip on target sides | 115 | +31.03 | 1.465 | −12.21 |
| Gap exits at gap-through level | 115 | +32.00 | 1.485 | −12.00 |

PF remains ≥ 1.465 under 1-pip adverse exit slippage (pre-registered HOLDS
threshold was PF > 1.4). Adverse gap treatment costs only +0.26R of the
+32.26R edge (< 1%; pre-registered FRAGILE trigger was > 50%): the
strategy does **not** depend on favorable gap fills. (Note: C2 and C3 rows
are numerically identical because stop exits are ~1R-wide events while
target exits are ~2R-wide; a fixed 1-pip slip converts to nearly the same
R-shift on both — documented, not tuned.)

## Parameter Sensitivity (§D)

| Perturbation | Trades | Total R | PF | WR% | maxDD |
|---|---|---|---|---|---|
| **Control** | **115** | **+32.26** | **1.489** | **42.61** | **−12.0** |
| Stop 0.9 ATR | 115 | +36.74 | 1.540 | 40.87 | −11.78 |
| Stop 1.1 ATR | 115 | +31.79 | 1.505 | 45.22 | −12.18 |
| Target 1.8 ATR | 115 | +33.40 | 1.539 | 46.09 | −10.20 |
| Target 2.2 ATR | 115 | +29.00 | 1.414 | 39.13 | −12.80 |
| Daily EMA20→19 | 121 | +26.26 | 1.365 | 40.50 | −10.00 |
| Daily EMA20→21 | 110 | +28.26 | 1.442 | 41.82 | −12.00 |
| Daily EMA50→49 | 114 | +30.26 | 1.459 | 42.11 | −12.00 |
| Daily EMA50→51 | 116 | +31.26 | 1.467 | 42.24 | −12.00 |
| Weekly EMA10→9 | 115 | +32.26 | 1.489 | 42.61 | −12.00 |
| Weekly EMA10→11 | 112 | +35.26 | 1.560 | 43.75 | −10.00 |
| Weekly EMA20→19 | 115 | +32.26 | 1.489 | 42.61 | −12.00 |
| Weekly EMA20→21 | 113 | +34.26 | 1.535 | 43.36 | −10.00 |

Every neighbor lands in the PF band **1.36–1.56** and every total R is
positive (+26.3R to +36.7R). No cliff, no sign flip, no PF collapse; the
control is not sitting on a razor-thin optimum (several neighbors are
higher — reported as-is; none is selected). Signal-cohort counts shift
modestly (110–121), consistent with a stable underlying signal rather
than knife-edge conditions.

## Data / Trade-Omission Stress (§F)

| Experiment | Result |
|---|---|
| Remove top-1 winner | +30.10R, PF 1.456 |
| Remove top-2 | +28.01R, PF 1.424 |
| Remove top-5 | +22.00R, PF 1.333 |
| Remove top-10 | +12.00R, PF 1.182 |
| Random 1% × 20 seeds | +30.26..33.26R, PF 1.46–1.51, 0/20 negative |
| Random 5% × 20 seeds | +23.26..35.26R, PF 1.36–1.58, 0/20 negative |
| Random 10% × 20 seeds | +14.26..38.26R, PF 1.22–1.68, 0/20 negative |
| Remove 10% of winners × 20 seeds | +22.18..22.26R (median +22.26) |
| Remove 20% of winners × 20 seeds | +12.01..12.26R (median +12.26) |

No sign flip at any omission level (0/60 random seeds negative). Even the
simultaneous removal of the ten best trades leaves +12R. Removing a fifth
of all winning trades still leaves ≈ +12R. This matches and extends the
Phase-27 concentration finding: the edge is **broadly distributed**, not
carried by a handful of trades.

## Monte Carlo — Trade-Order Stress (§G)

Seed 20290926, 10,000 permutations of the fixed 115-trade outcome set:

| Statistic | Value |
|---|---|
| Median maxDD | −9.00R |
| p5 / p1 maxDD | −14.00R / −17.00R |
| p95 maxDD | −6.00R |
| Worst simulated maxDD | −24.91R |
| **P(maxDD worse than −12R)** | **12.04%** |
| Losing streak p50 / p95 / max | 7 / 11 / 21 |

The realized −12R drawdown is an ~88th-percentile-unfavorable ordering
(median −9R), consistent with Phase 28. The practical planning envelope is
p5–p1 = −14R to −17R, worst simulated −24.9R.

## Exposure Stress (§H)

Control concurrency: **max 6 simultaneous positions**, average 1.748,
2.07% of calendar days hold > 1 position, 43 overlapping trade pairs.

| Regime | Trades | Total R | PF | maxDD |
|---|---|---|---|---|
| H1 full concurrency (control) | 115 | +32.26 | 1.489 | −12.0 |
| H2 cap 3 | 113 | +31.26 | 1.481 | −12.0 |
| H3 cap 2 | 106 | +29.26 | 1.480 | −11.0 |
| H4 cap 1 | 84 | +27.26 | 1.580 | −6.0 |

Realistic exposure restrictions do **not** destroy the evidence: the edge
survives every cap (27–31R, PF 1.48–1.58), and stricter caps actually
reduce drawdown while retaining most of the R. The multi-position property
is therefore not a load-bearing assumption — the same trades under a
one-position constraint remain clearly positive.

## Capital Path / Drawdown Envelope (§I)

Actual sequence: final +32.26R; 10 drawdown episodes; episode depths
−12.0, −9.0, −4.0, −3.0, −3.0, −3.0, −3.0, −2.0, −1.0, −1.0R.
Counts by depth: 2 episodes deeper than 5R, 2 deeper than 8R, 1 deeper
than 10R, 1 at 12R (float-tolerance counted), 0 beyond. Longest recovery
34 trades; median recovery 4. Combined with Family G: a user had to
tolerate −12R historically, should plan for median −9R / p5 −14R /
p1 −17R / worst-simulated −24.9R orderings of the *same* trade set.
Position sizing is explicitly out of scope (later phase).

## Temporal Stress (§J)

All 16 walk-forward test windows
(`PHASE29_TEMPORAL_STRESS.csv`): 11 positive, 3 negative (2014 −3R, 2020
−4R, 2021 −2R), 2 zero-signal (2019, 2022). Best window 2025 (+11R, 13
trades); worst 2020 (−4R). Longest zero-signal run: 1 window;
max consecutive losing windows: 2; max consecutive profitable windows: 4.
Positives are distributed across 2004–2025 rather than clustered in one
era. Every window's trade count is reported alongside its R (per-window n
is small — flagged, not hidden).

## Regime Stress (§K)

| Cohort | Trades | Total R | PF | WR% | Small sample |
|---|---|---|---|---|---|
| Volatility low (< 0.5% ATR/price) | 7 | −1.00 | 0.80 | 28.6 | **YES** |
| Volatility mid (0.5–1.0%) | 93 | +27.26 | 1.514 | 43.0 | no |
| Volatility high (> 1.0%) | 15 | +6.00 | 1.750 | 46.7 | no |
| Trend narrow (tercile) | 39 | +12.01 | 1.546 | 43.6 | no |
| Trend mid (tercile) | 37 | +2.26 | 1.094 | 35.1 | no |
| Trend wide (tercile) | 39 | +18.00 | 1.900 | 48.7 | no |

The strategy does **not completely collapse outside its strongest
cohorts**: the large mid-volatility cohort (81% of trades) carries PF
1.51; high-vol and wide-trend cohorts are positive; the only negative
cohort (low-volatility, n = 7) is explicitly small-sample and trivially
sized. These are descriptive entry-time classifications (§16) — no filter
was created and none may be.

## Cross-Pair Stress (§L, secondary)

| Pair / slice | Trades | Total R | PF | WR% | maxDD |
|---|---|---|---|---|---|
| GBPUSD full | 152 | +4.40 | 1.044 | 34.2 | −16 |
| GBPUSD OOS 2010–2025 | 101 | +19.00 | 1.312 | 39.6 | −11 |
| USDJPY full | 118 | +5.00 | 1.065 | 34.7 | −16 |
| USDJPY OOS 2010–2025 | 88 | +5.00 | 1.088 | 35.2 | −16 |
| AUDUSD full | 123 | −8.98 | 0.894 | 30.9 | −23 |
| AUDUSD OOS 2010–2025 | 73 | −16.00 | 0.704 | 26.0 | −22 |

The full-history rows **exactly reproduce the historical Phase-23
benchmarks** (GBPUSD 152/+4.40/1.04; USDJPY 118/+5.00/1.06; AUDUSD
123/−8.98/0.89) — an additional integrity confirmation that the Golden
logic executed here is the historical logic. Transfer remains **weak and
pair-specific** (consistent with Phases 27–28): GBPUSD and USDJPY hold
modest positive edges, AUDUSD is negative, worst in its OOS slice. EURUSD
remains the only instrument with strong evidence; pairs were not pooled
and no per-pair change was made.

## Robustness Envelope (§24)

**What survived (HOLDS):**
- Execution cost (0–6 pips friction; adverse slippage) — smooth,
  monotone, no break-even inside the grid.
- Exit degradation (adverse stop/target slippage, adverse gap fills) —
  ≤ 2% of edge at pre-registered stress levels.
- Parameter neighborhood (bracket multipliers, all four EMAs) — PF band
  1.36–1.56, all positive, no cliff.
- Trade omission (targeted and random, 60 seeds, 0 negative) and
  winner-removal — edge is broad-based.
- Exposure restriction (caps 3/2/1) — evidence intact, drawdown improves.
- Temporal distribution — profits spread across the timeline; no era
  dependence; losing runs bounded at 2 windows.
- Regime breadth — no cohort collapse; only negative cohort is n = 7.

**What degraded (DEGRADED-BUT-POSITIVE):**
- Entry delay of 1 bar: ~38% of total R lost, PF 1.29, maxDD −18R.

**What is fragile (FRAGILE):**
- Entry delay of 2 bars: edge effectively exhausted (+2R, PF 1.03).
  The strategy is a next-day-execution system; the signal is
  short-lived by construction (breakout confirmation).

**What assumptions matter most (ranked by stress sensitivity):**
1. Entry at the next open (timing, not cost, is the sensitive axis).
2. EURUSD as the instrument (cross-pair transfer is weak; AUDUSD
   negative).
3. Volatility environment (mid-volatility cohort carries the bulk of
   the edge — descriptive, not actionable).
4. NOT sensitive: friction level, gap-fill treatment, bracket
   multipliers, EMA spans, concurrency, trade-order ordering.

**What broke: nothing.** No pre-registered BREAKS criterion was met in
any family.

---

## CORRECTION (post-commit audit note, appended 2026-09-26)

Flagged during independent-audit preparation (read-only recomputation on
the control ledger; no Phase-29 artifact was re-run or regenerated):

1. **Family C rows are mislabeled in `PHASE29_STRESS_RESULTS.csv`.** The
   committed implementation applies `exit_slip_pips` to stop-side exits
   (stop, stop_assumed_first, gap_stop) AND target exits jointly, and —
   because `gap_target` exits are coded `o + slip` — applies a small
   *favorable* slip to the 3 gap-target fills. The rows
   `C2-STOPSLIP-*` and `C3-TGTSLIP-*` are therefore one combined
   experiment executed twice, not separate stop-only / target-only
   treatments. Exact ledger-level decomposition at 1 pip (control
   +32.2644R; 66 stop / 46 target / 3 gap_target): as-implemented rows
   +31.0263R; correctly-separated stop-only (C2) +31.4995R;
   target-only fully-adverse incl. gap_target (C3) +31.7271R; fully
   adverse on all exits +30.9622R. The earlier explanation that the
   identical C2/C3 values arise from "1R vs 2R exit widths" is **wrong**;
   they are identical because both rows ran the same combined
   treatment. Corrected conclusion: unchanged — every decomposition is
   +31.0R to +32.0R (≤ 4% of edge; PF ≥ 1.47), all pre-registered
   HOLDS/FRAGILE readings for Family C stand.
2. **F2 trade-count column off by one at the 1% rate.** Sampling used
   `k = round(rate × 115)` → 1 / 6 / 12 trades removed (remaining 114 /
   109 / 103); the CSV `trades` column used `int(115 × (1 − rate))` and
   shows 113 / 109 / 103. Only the 1% row is affected (113 should read
   114). Ranges and 0/20-negative findings are unaffected (they are
   computed from the actual sampled omissions).
3. **H-CAP selection detail for the audit record:** trades are walked in
   `entry_date, signal_date` order; a trade is kept iff the number of
   already-kept trades with `exit_date >= its entry_date` is below the
   cap. Ties within one entry date fall back to ledger (signal-date)
   order — deterministic, retrospective by construction, and disclosed
   as a descriptive exposure test, not a strategy.
4. **Concurrency metrics definitions:** `avg_simultaneous` 1.7478 is the
   mean over trades of the count of ledger trades overlapping that trade
   (including itself, calendar-date closed interval);
   `pct_days_with_gt1_position` 2.07% uses calendar days including
   weekends.

The committed stress CSVs and summary JSON remain exactly as produced at
`a3dc35e`; this note is appended so the record and the audit agree.
Original section text above is preserved unchanged.
