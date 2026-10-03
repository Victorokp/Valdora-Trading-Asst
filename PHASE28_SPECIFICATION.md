# PHASE28_SPECIFICATION.md

Phase: 28 (validation gate)
Predecessor: Phase 27 — CLOSED (Outcome B: no robust improvement identified;
C3 frozen but not adopted)
Control: PHASE-21 GOLDEN REFERENCE
(`phase21_historical_reference.py`,
SHA-256 `b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95`)
Research candidate: C3_vol_percentile_floor — frozen, NOT adopted, NOT
modified. Optimization and parameter tuning: FORBIDDEN and not performed.

## 1. Objective

«Determine how convincingly the untouched Phase-21 Golden Reference performs
when evaluated under strict out-of-sample and walk-forward conditions.»

This is a validation gate, not a search for improvements. The question is how
much evidence exists that the EURUSD strategy's behavior is not a historical
artifact — not whether the backtest can be made better.

## 2. Immutable inputs (hash-gated before and during the phase)

- Golden Reference: `b0d84b15…454e95` (verified; never edited)
- Dataset `eurusd_d.csv`: `e0676d92…fd0d52` (verified; unmodified)
- Historical ledger: `30d22be4…f70d0` (regenerated and hash-checked at the
  start of the walk-forward run; byte-identical)
- C3 constants: unchanged (ATR percentile floor 0.10, frozen in Phase 27)

## 3. Validation structure

- **Walk-forward**: historical recovered structure — anchors Y = 2004…2019,
  TRAIN [Y, Y+4], VALIDATION Y+5, TEST Y+6 (entry-year bucketing), 16
  test windows covering 2010–2025. The strategy is identical in every
  window; re-bucketing is evaluation only.
- **OOS definition**: the union of the 16 test buckets (entry years
  2010–2025) = 76 trades. Distinct from, and documented against, the
  chronological final bucket (entry > 2023-04-23, 23 trades, of which 20
  fall inside the window years and 3 enter in 2026).
- **Primary instrument**: EURUSD. Cross-pair results are reported
  separately as the secondary question and never pooled into the primary
  evidence.

## 4. Experiments executed

Walk-forward window table (§6), test-only aggregate and window distribution
(§7–8), OOS equity curve from test trades only (§9), per-year temporal
stability with trade counts and small-sample flags (§10–11), regime-
conditional OOS descriptives using entry-time features only (§12), cross-pair
secondary validation (§14), C3 rejected-candidate comparison (§15), data-
integrity / look-ahead / split-boundary audits (§16–18), multi-position OOS
metrics (§19), friction left at the control 1.5 pips (§20), OOS descriptive
statistics (§21), seeded bootstrap (§22), OOS concentration check (§23),
seeded Monte Carlo order test (§24).

## 5. Inviolables honored

No new filters, indicators, parameters, exit or entry rules; no C3
modification; no optimization; the Golden Reference untouched. Weaknesses
found during validation are recorded as research questions for a later
phase, not fixed here.

## 6. Reproducibility

Python 3.14.7, pandas 3.0.6, numpy 2.5.3 (repository environment). Seeds:
bootstrap 20280926, Monte Carlo 20280927 (10,000 iterations each). All
artifacts hash-recorded in `PHASE28_STATISTICS.md`; determinism enforced by
`phase28/tests/test_phase28_gates.py::test_10` (byte-for-byte re-run).
