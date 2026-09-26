# PHASE28_DATA_AUDIT.md

All audits PASS. Machine-readable results:
`phase28/results/phase28_validation.json`.

## 1. Dataset integrity (§16)

| Check | Result |
|---|---|
| File | `eurusd_d.csv`, SHA-256 `e0676d92…fd0d52` (unchanged) |
| Rows (post-filter, ≥ 2003-12-01) | 5,914 (2003-12-01 → 2026-09-25) |
| Duplicate dates | 0 |
| Chronological order | true |
| Missing OHLC rows | 0 |
| Non-positive OHLC rows | 0 |
| High < Low | 0 |
| High < Open or High < Close | 0 |
| Low > Open or Low > Close | 0 |
| Weekend rows | 0 |
| Largest calendar gap | 4 days (weekend; no > 7-day gap) |
| Ledger dates absent from dataset | 0 (all signal/entry/exit dates exist) |

Golden Reference verification test passed before validation began
(`tests/test_phase21_historical_reference.py`, 15/15 OK).

## 2. Look-ahead audit (§17)

**Method**: for EVERY one of the 76 OOS signal days D, the entire pipeline
(load → filter → EMA20/50 → ATR → weekly W-FRI regime → backward mapping →
signal conditions → 60-bar gate) was rebuilt from data **truncated to rows
with Date ≤ D**, and the signal value at D was compared against the full-
history run. If any signal consumed information after its signal-day close,
the truncated pipeline could not reproduce it.

- Signals checked: **76/76**
- Failures: **0** → **PASS**

**Entry timing**: all 76 ledger entries equal the next dataset row's
`Open + 1.5 × 0.0001` exactly (tolerance 1e-12) → **PASS**. No next-day
information influences signal generation; entries use only next-day open as
specified.

Feature causality: regime features (ATR percentile, EMA gap, breakout
magnitude, candle range, weekly separation) are computed from windows
ending at the signal bar; weekly values are backward-mapped completed bars
(same-Friday visibility is the Golden Reference's own mapping, inherited
unchanged — not a Phase-28 addition).

## 3. Split-boundary audit (§18)

- All 115 ledger trades are bucketed exactly by the historical rule
  (entry date; train ≤ 2019-11-20 < validation ≤ 2023-04-23 < final).
- **Trades whose exit falls in a later period: 0** (no train trade exits
  after 2019-11-20; no validation trade exits after 2023-04-23). The
  historical semantics assign a trade to its entry-date bucket and never
  re-bucket by exit; with zero straddling trades, no ambiguity exists and
  nothing needed to be invented. **No ambiguity discovered → no STOP.**

### Disclosure: walk-forward year reuse (important)

The 16 rolling windows intentionally reuse calendar years across windows: a
2012 trade sits in the **test** bucket of anchor 2006 and in the **train**
buckets of anchors 2008–2012. Consequently, "OOS" here means *outside each
window's own train/validation*, evaluated window-by-window — NOT globally
unseen calendar years. This is inherent to the historically recovered
rolling walk-forward and is evaluation-only re-bucketing of one frozen trade
set; no rule, parameter, or feature is fitted in any window, so no
information can flow from a test bucket into the strategy. The strictly
untouched chronological final period (entry > 2023-04-23; 23 trades) is
reported separately and was never used to select anything.

### Zero-trade windows

Test years 2019 and 2022 contain **no qualifying signals** (0 trades), so
anchors 2013 and 2016 are flat windows (test R = 0.0). They are counted as
non-negative but carry no evidence.

## 4. Multi-position preservation (§19)

The Golden Reference's overlapping-position behavior is preserved
everywhere in Phase 28 (no one-position conversion). OOS metrics: max 6
simultaneous positions; average 1.7368; 35 of 76 OOS trades overlapped
another position; overlapping trades contributed +13.00R (40.3% of the OOS
total), single-position trades +19.26R.

## 5. Execution friction (§20)

No repeat of the friction experiment. The official OOS result uses the
control 1.5-pip entry friction. (Phase 27's supplementary grid remains on
record; it is not part of the official Phase-28 evidence.)
