# Phase-21 Closure Report — Historical Reproduction & Golden Reference

**PHASE 21 STATUS: CLOSED — HISTORICAL IMPLEMENTATION REPRODUCED**

Phase-21 historical reconstruction has been independently reproduced: the
historical-compatible implementation, executed against the authoritative
EUR/USD dataset, regenerated the historical benchmark **exactly** and its
115-row trade ledger **byte-for-byte**. This report formally closes Phase 21,
records the recovered historical semantics, and designates the
historical-compatible implementation as the **PHASE-21 GOLDEN REFERENCE**.

The current frozen implementation (`phase21_reconstruction.py`) is preserved
unchanged alongside it. Nothing was merged into `main`; the closure artifacts
live on the reference branch `phase21-reconciliation-experiment`.

---

## 1. Historical reproduction proof

Historical benchmark (from the committed forensic package, commit `79f8681`):

| Metric | Value |
|---|---|
| Trades | **115** |
| Win rate | **42.6%** |
| Profit factor | **1.49** |
| Total R | **+32.26R** |
| Max drawdown | **−12.00R** (closed-trade R, exit-date order) |
| Train | 78 trades, +24.26R, PF 1.55 (maxDD −9.00R) |
| Validation | 14 trades, −2.00R, PF 0.80 (maxDD −7.00R) |
| Final | 23 trades, +10.00R, PF 1.83 (maxDD −4.00R) |

Independent executions that produced these numbers:

1. The historical package's own `phase21.py` run AS-IS (pinned environment,
   Python 3.12.14 / pandas 3.0.2 / numpy 2.4.4).
2. The reconciliation experiment variant implementing only the five recovered
   semantic differences (H1–H5 below), on the authoritative dataset.

Both runs produced the identical ledger. **The reconstructed ledger is
byte-identical to the historical 115-row ledger.**

SHA-256 hashes:

| Artifact | SHA-256 |
|---|---|
| Historical ledger (package `output/phase21_trades_ledger.csv`) | `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0` |
| AS-IS historical run ledger | `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0` |
| H1–H5 variant ledger (`phase21_experiment_results/phase21_trades.csv`) | `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0` |
| Authoritative dataset `eurusd_d.csv` (14,270 rows, 1971-01-04 → 2026-09-25) | `e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52` |
| Golden Reference module `phase21_historical_reference.py` | `b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95` |
| Frozen implementation `phase21_reconstruction.py` (unchanged) | `a83e794f401630a03ba9d386be7f99bf3aa8a8e58939586b83428a6d9e78ca5d` |

Historical package source hashes (from `HASHES.txt`, independently verified):
`phase14.py` `e8c82bee…1987c0`, `phase20.py` `cfac42f0…b0f2b64`,
`phase21.py` `5408d8ee…6394d478`, `phase23.py` `a8d04d8a…f599a0689`,
`phase24.py` `b808cc27…1bf11ec95e`, `phase25.py` `aab17c57…111bf11ec95e`.

---

## 2. The five recovered historical semantics (exact)

### H1 — Position concurrency

The historical engine opens a trade for **every qualifying signal**. There is
**NO one-position-at-a-time restriction**. Exact historical implementation
structure (`phase14.py::simulate_trades`):

```python
signal_idxs = daily.index[daily[signal_col]].tolist()
for i in signal_idxs:
    ...  # build and resolve one trade per signal, independently
```

No position-state gate exists anywhere in the loop: the engine never checks
whether a previous trade is still open, never tracks open positions, and
never skips or queues a signal because a position is active. Consequence
(observed in the reproduced 115-row ledger): 29 of 114 consecutive trade
pairs overlap in time; up to 4 positions are open simultaneously.

### H2 — EMA50 rising condition

Exact historical rule (`phase21.py`):

```
EMA50_rising = EMA50 > EMA50.shift(5)
```

i.e. **EMA50[D] > EMA50[D−5]**. This is not "EMA50 is rising" in any looser
sense: the formula compares the EMA50 value on day D against its value five
rows earlier, on the post-filter frame. (The current frozen implementation
uses D−1 instead; see the semantic-difference table.)

### H3 — Historical data window + warm-up

Data filter (`phase14.py::load_daily`, applied by `phase21.py`):

```
date >= 2003-12-01
```

Result: **5,914 EURUSD rows** (2003-12-01 → 2026-09-25) out of the 14,270-row
authoritative file.

Warm-up (`phase21.py`, verbatim):

```python
warmup = 60
daily.loc[: warmup - 1, "signal"] = False
```

Exactly what this means:

- **rows 0–59 are signal-suppressed** (the boolean signal column is set to
  False on the first 60 rows of the post-filter frame);
- rows are **NOT removed**;
- indicator history is **NOT shortened**;
- EMA/ATR values are **NOT modified**;
- it only prevents signal generation during those first 60 filtered rows
  (2003-12-01 .. 2004-03-02). Indicators still warm up from 2003-12-01.

Observed counts on the authoritative dataset: **raw qualifying signals 120;
signals after the 60-row gate 115** (5 suppressed).

### H4 — Historical ATR

Exact historical calculation (`phase14.py::atr`). TR is:

```
max(H - L, abs(H - prev_close), abs(L - prev_close))
```

implemented as `pd.concat([...], axis=1).max(axis=1)` with
`prev_close = Close.shift(1)`; **row 0 naturally uses `H - L`** because the
unavailable previous-close terms are NaN and are skipped by the NaN-skipping
row maximum.

ATR smoothing:

```
tr.ewm(alpha=1/14, adjust=False).mean()
```

- **No `min_periods`.**
- **No separate 14-period seed** (no Wilder seed row; y[0] = TR[0], then
  recursive y[t] = (1 − 1/14)·y[t−1] + (1/14)·TR[t]).
- The first ATR is therefore **immediately valid from the first filtered
  row** (row 0 = 2003-12-01).

Observed first values on the authoritative dataset:

| Row | Date | ATR |
|---|---|---|
| 0 | 2003-12-01 | 0.0102 |
| 1 | 2003-12-02 | 0.01062143 |
| 2 | 2003-12-03 | 0.01029847 |
| 3 | 2003-12-04 | 0.01042715 |

**Signal-day ATR is used**: stop and target derive from the ATR value on the
SIGNAL day (`sig_atr = daily.loc[i, "ATR"]`). Signals whose signal-day ATR is
NaN or non-positive are skipped (none occur in this dataset window).

### H5 — Historical split boundaries

Exact, empirically validated boundaries (bucketing by **entry date**):

- **Train:** `entry_date <= 2019-11-20`
- **Validation:** `2019-11-20 < entry_date <= 2023-04-23`
- **Final:** `entry_date > 2023-04-23`

These exact date boundaries are used as-is. They are **not** replaced with a
generic 70/15/15 calculation. They are now **empirically validated by
reproduction**: the H1–H5 variant asserts the derived boundaries
(`start + int(total_days × 0.70)` and `start + int(total_days × 0.85)` over
the 8,334-day window) equal exactly these dates, and the byte-identical
ledger confirms the bucketing. (Split statistics treat
`open_at_data_end` trades as unresolved and exclude them from win rate/PF/
total R; this run contains none.)

---

## 3. Unchanged semantics (already identical in current and historical engines)

The following were verified identical between the current frozen
implementation and the historical engine, and were NOT touched by the
H1–H5 port:

- Weekly resampling: **`resample("W-FRI")`** OHLC aggregation
- Weekly **EMA10 / EMA20** (`ewm(span, adjust=False)` on weekly closes)
- Weekly **regime**: EMA10w > EMA20w AND weekly Close > EMA20w
- **Completed-Friday mapping** (backward mapping; a daily Friday matches its
  own weekly bar — searchsorted side="left" − 1 ≡ merge_asof backward with
  exact matches allowed)
- Daily **EMA20 / EMA50 structure** (`ewm(span=20/50, adjust=False)`)
- **Long-only**
- Pullback: **Low[D] <= EMA20[D]**
- Pullback: **Close[D] > EMA20[D]**
- Confirmation: **Close[D] > High[D−1]**
- **Next-day-open entry**
- **1.5-pip entry friction** (0.0001 per pip for EUR/USD)
- **1 ATR stop** (entry − 1×ATR)
- **2 ATR target** (entry + 2×ATR)
- **Gap-to-open handling** (open ≤ stop → exit at open; open ≥ target → exit
  at open; stop checked before target)
- **Same-candle stop-first handling** (both touched intrabar → exit at the
  stop price)
- Remaining **exit logic** (daily scan, first touch resolves)
- **Signal-day ATR usage**
- **ADX is not a signal filter** (the historical Phase-21 engine computes no
  ADX at all; ADX appears only in the companion `phase20.py`/`phase24.py`
  diagnostics)

---

## 4. PHASE-21 GOLDEN REFERENCE — designation

The historical-compatible implementation is hereby explicitly designated:

> **PHASE-21 GOLDEN REFERENCE**

- File: **`phase21_historical_reference.py`** (on the reference branch), a
  byte-identical copy of the reconciliation experiment module
  (`phase21_historical_reference.py` SHA-256 `b0d84b15…454e95` =
  `phase21_reconciliation_experiment.py` SHA-256 `b0d84b15…454e95`).
- Status: **read-only forensic/reference implementation**. Its behavior is
  not altered by the renaming/copying.
- It must reproduce: **115 trades / 42.6% WR / PF 1.49 / +32.26R / −12.00R**
  and the **byte-identical 115-row ledger**
  (SHA-256 `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`).
- Purpose: exact historical Phase-21 behavior; benchmark reproduction;
  forensic reference; **regression oracle** for any future change.

Both implementations are preserved separately:

| Implementation | File | Purpose |
|---|---|---|
| Current Phase-21 reconstruction | `phase21_reconstruction.py` (untouched, `main`) | Preserve the previously implemented interpretation and its deterministic 141-trade / +15.09R result; serve as historical/current comparison evidence |
| Golden Reference | `phase21_historical_reference.py` (reference branch) | Exact historical Phase-21 behavior; benchmark reproduction; forensic reference; regression oracle |

The two are **not collapsed** into one implementation.

---

## 5. Golden Reference verification test

`tests/test_phase21_historical_reference.py` (on the reference branch):

1. Loads `phase21_historical_reference.py` as a module (the file itself is
   never modified).
2. Runs the Golden Reference pipeline against the authoritative
   `eurusd_d.csv`.
3. Regenerates the 115-row historical ledger.
4. Computes SHA-256 of the regenerated ledger file.
5. Compares it against the known historical ledger hash recorded in the
   test metadata (`EXPECTED_LEDGER_SHA256 = 30d22be4…f70d0`).
6. **Fails loudly** if they differ — and by design compares the **ledger
   file itself**, not merely summary statistics. A matching trade count / PF /
   total R is explicitly insufficient: the test asserts
   whole-file byte equality via SHA-256 (plus row count and headline stats as
   secondary gates, and a module-freeze gate asserting the Golden Reference
   remains a byte-identical copy of the experiment module).

Test result: **15/15 OK** (12 frozen reconstruction tests + 3 Golden
Reference tests), under both the repository environment and the pinned
historical environment (Python 3.12.14 / pandas 3.0.2 / numpy 2.4.4).

---

## 6. Semantic-difference table

| Component | Current Frozen | Historical Golden Reference |
|---|---|---|
| Position concurrency | One position | Multiple positions |
| EMA50 rising | D > D-1 | D > D-5 |
| Data start | Current full dataset | >= 2003-12-01 |
| Warm-up | Current implementation | 60 signal-suppression rows |
| ATR | Current implementation | historical EWM(alpha=1/14) |
| Split | generic calendar 70/15/15 | exact historical date boundaries |
| Weekly mapping | Same | Same |
| Entry | Same | Same |
| Friction | Same | Same |
| Stop/Target | Same | Same |
| Gap handling | Same | Same |

---

## 7. Research gate

**BLOCKED until the owner explicitly authorizes the next research phase:**

- Phase 26
- Phase 27
- strategy optimization
- parameter tuning
- benchmark fitting

No optimization, no tuning, no benchmark fitting, and no speculative
semantic changes were performed during closure.

---

## 8. Closure verification record

| Requirement | Status |
|---|---|
| `main` | **UNCHANGED** (`79f86813…6890a`, identical to `origin/main`) |
| `phase21-reconciliation-experiment` branch | **PRESERVED** (closure artifacts committed here) |
| Golden Reference | **PRESERVED** (`phase21_historical_reference.py`, byte-identical copy) |
| Historical ledger | **BYTE-IDENTICAL** (SHA-256 `30d22be4…f70d0` matched by regeneration) |
| Closure report | **CREATED** (`PHASE21_CLOSURE_REPORT.md`) |
| Tests | **PASS** (15/15) |

Historical source inspected; authoritative dataset verified; historical
engine executed; benchmark reproduced; 115-row ledger reproduced; ledger
SHA-256 matched byte-for-byte; no optimization; no tuning; no benchmark
fitting; no speculative semantic changes.

**PHASE 21 STATUS: CLOSED — HISTORICAL IMPLEMENTATION REPRODUCED**
