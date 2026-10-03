# Phase-21 Reconciliation Experiment — Report

**Result: the five confirmed historical semantic differences fully explain the
gap. The H1–H5 variant reproduced the historical benchmark EXACTLY on the
authoritative dataset, and the generated ledger is BYTE-IDENTICAL
(same SHA-256) to the historical 115-row ledger.**

Per instruction: STOP. Nothing was merged. The authoritative
`phase21_reconstruction.py` was not modified.

## 1. Isolation

- Experiment ran on branch `phase21-reconciliation-experiment` (created from
  `79f8681`); `main` was not advanced by this experiment.
- The variant is a single self-contained file,
  `phase21_reconciliation_experiment.py`, with **no imports** from
  `phase21_reconstruction.py` — full source isolation.
- Environment: Python 3.12.14, pandas 3.0.2, numpy 2.4.4 (the historical
  package's pinned environment; the historical code is float-sensitive to
  operation order, so the pinned stack is used).
- Dataset: the authoritative `eurusd_d.csv`
  (SHA-256 `e0676d9232c87be3…`), unchanged.
- Post-experiment integrity check on `main`: working tree clean of code
  changes, 12/12 tests pass, `phase21_reconstruction.py`
  SHA-256 `a83e794f…78ca5d` unchanged, dataset hash unchanged.

## 2. The five implemented historical semantics (evidence-backed only)

- **H1 — Multi-position concurrency** (`phase14.py::simulate_trades`):
  `for i in signal_idxs:` — every qualifying signal opens a trade; no
  position-state check anywhere in the loop.
- **H2 — EMA50 rising** (`phase21.py`, verbatim): `EMA50_rising =
  EMA50 > EMA50.shift(5)` — EMA50[D] > EMA50[D−5]. Not reinterpreted.
- **H3 — Data window + warm-up** (`phase14.py::load_daily` + `phase21.py`):
  the authoritative file (14,270 rows) is filtered to
  `Date >= 2003-12-01` → **5,914 rows (2003-12-01 .. 2026-09-25)**. The
  60-bar warm-up is, verbatim, `warmup = 60; daily.loc[: warmup - 1,
  "signal"] = False`: it **zeroes the signal column on rows 0..59** of the
  post-filter frame (positional slice). It drops no rows, does not shorten
  indicator history, and does not touch EMA/ATR values — it only forbids a
  trade from being generated from a signal in the first 60 post-filter rows
  (~2003-12-01 .. 2004-03-02). Indicator state still warms from 2003-12-01.
  Observed in this run: raw signals 120 → 115 after zeroing rows 0..59
  (5 signals suppressed by the warm-up).
- **H4 — Historical ATR** (`phase14.py::atr`), recorded exactly:
  - TR definition: `pd.concat([High − Low, (High − prev_close).abs(),
    (Low − prev_close).abs()], axis=1).max(axis=1)` with
    `prev_close = Close.shift(1)`; on row 0 prev_close is NaN, the NaN terms
    are skipped by `max(axis=1)`, so TR[0] = High[0] − Low[0].
  - Smoothing: `tr.ewm(alpha=1/14, adjust=False).mean()` — recursive
    Wilder-style EMA, y[0] = TR[0], y[t] = (1−1/14)·y[t−1] + (1/14)·TR[t].
  - Initialization/warm-up: **no min_periods, no seed override**; the series
    is finite from row 0. **First valid ATR row = 0** (2003-12-01);
    observed ATR[0..3] = 0.0102, 0.0106214286, 0.0102984694, 0.0104271501.
  - Signal-day ATR is used: `sig_atr = daily.loc[i, "ATR"]` from the SIGNAL
    day; skipped if `pd.isna(sig_atr) or sig_atr <= 0`.
- **H5 — Historical split** (`phase14.py::split_trades` semantics with this
  dataset's derived boundaries, asserted in code): entry_date ≤ **2019-11-20**
  → train; ≤ **2023-04-23** → validation; > 2023-04-23 → final (bucketing by
  entry date, inclusive `<=`).

Unchanged shared axes (per instruction): weekly W-FRI resample/regime and
searchsorted(side="left")−1 mapping; entry at next Open + 1.5 pips; stop =
entry − 1·ATR; target = entry + 2·ATR (signal-day ATR); gap → fill at open
(stop checked before target); same-candle stop-first at the stop price;
exit logic; end-of-data = final close, flagged `open_at_data_end`; all other
signal conditions; long-only.

## 3. Results — A–G (items A–F), run against the authoritative dataset

Command: `/tmp/repro-venv/bin/python phase21_reconciliation_experiment.py
/tmp/hfp/forensic_package/output/phase21_trades_ledger.csv`

| Metric | Variant (H1–H5) | Historical benchmark | Match |
|---|---|---|---|
| A. Trade count | **115** | 115 | ✔ |
| B. Win rate | **42.6%** (49 W / 66 L, resolved basis) | 42.6% | ✔ |
| C. Profit factor | **1.49** | 1.49 | ✔ |
| D. Total R | **+32.26** (32.2644) | +32.26 | ✔ |
| E. Max drawdown | **−12.00R** (closed-R, exit-date order) | ≈ −12R | ✔ |
| F. Train | **78 trades, 43.6% WR, PF 1.55, +24.26R, maxDD −9.00** | 78 / 43.6% / 1.55 / +24.26R | ✔ |
| F. Validation | **14 trades, 28.6% WR, PF 0.80, −2.00R, maxDD −7.00** | 14 / 28.6% / 0.80 / −2.00R | ✔ |
| F. Final | **23 trades, 47.8% WR, PF 1.83, +10.00R, maxDD −4.00** | 23 / 47.8% / 1.83 / +10.00R | ✔ |

Outcome mix: 66 `stop`, 46 `target`, 3 `gap_target`, 0 `open_at_data_end`.
Worst losing streak 7.

**G. Ledger byte/hash comparison:**

- Variant ledger: `phase21_experiment_results/phase21_trades.csv`
  SHA-256 = `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`
- Historical ledger (`output/phase21_trades_ledger.csv`) SHA-256 =
  `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`
- **BYTE-IDENTICAL** (also identical to the AS-IS historical run's output).

## 4. Conclusion of the experiment

The five confirmed historical semantic differences (H1–H5) **fully and
sufficiently explain** the entire gap between the current frozen result
(141 trades / +15.09R, one-position, 1-day rising, full history) and the
historical benchmark (115 trades / +32.26R / −12R). With only those five
semantics ported onto the otherwise-identical shared axes, the authoritative
dataset reproduces the historical numbers exactly, byte-for-byte.

No first-divergence diagnostic was needed (the diagnostic code exists in the
experiment file and was not triggered).

**Per instruction: STOP. No merge. No tuning occurred at any point** — the
variant was written once from the documented historical semantics and matched
on the first execution.

## 5. One neutral observation (documented, not acted on)

On this experiment's 2003-12-01..2026-09-25 window with the H1–H5 semantics,
120 raw signals existed and the 60-bar gate suppressed 5 (→ 115 trades). The
identical gate on the historical package's run behaves the same way; the
suppressed signals all lie in the first 60 post-filter rows. This is recorded
only to document precisely how the warm-up operates; it changes nothing above.

## 6. Decision left to the project owner (not implemented)

Whether `phase21_reconstruction.py` (one-position, 1-day-rising, full-history)
should be reconciled to the historical semantics (multi-position, 5-day-rising,
≥2003-12-01 + 60-bar gate, no-min_periods ATR, calendar split + closed-R
drawdown) is a strategy/specification decision. Both engines are now fully
characterized, hash-verified, and independently reproducible; this experiment
demonstrates the exact, minimal, evidence-backed mapping between them.
