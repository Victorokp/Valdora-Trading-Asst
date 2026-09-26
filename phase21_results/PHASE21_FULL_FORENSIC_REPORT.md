# Phase-21 Frozen Reconstruction — Full Forensic Report

Frozen-rule execution and forensic audit. No optimization, tuning, or benchmark-driven changes were performed.

## Execution environment

- Branch: `main`
- Commit: `07519ee4c132092c8de1468c867975bceb9565d2`
- Python: 3.14.7
- pandas: 3.0.6
- numpy: 2.5.3
- Command: `uv run python phase21_reconstruction.py`
- Engine source SHA-256: `a83e794f401630a03ba9d386be7f99bf3aa8a8e58939586b83428a6d9e78ca5d`

## Data audit

| Pair | File | Status | Rows (raw/used) | First | Last | Duplicates | Unsorted | Missing | NonPositive | High<Low | Weekend | MaxGap(d) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EURUSD | eurusd_d.csv | available | 14270/14270 | 1971-01-04 | 2026-09-25 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| GBPUSD | gbpusd_d.csv | available | 5908/5908 | 2003-12-01 | 2026-09-24 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| AUDUSD | audusd_d.csv | available | 5906/5906 | 2003-12-01 | 2026-09-24 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| USDJPY | usdjpy_d.csv | available | 5913/5913 | 2003-12-01 | 2026-09-24 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |

No data rows were deleted or modified.

Data observation: eurusd_d.csv begins 1971-01-04, predating the euro's 1999 introduction; the early segment is a flat synthetic splice (Open == High on 100% of sampled 1971-74 rows). The engine fabricates nothing: the first EUR/USD signal day is 1995-02-10 because the daily pullback condition (Low <= EMA20 and Close > EMA20) never occurs earlier in the committed data.

## Frozen-mechanics verification

Verified by tests/test_phase21_reconstruction.py and code inspection:

- Weekly W-FRI resample, backward-aligned to daily dates; exact Friday matches allowed.
- Regime: weekly EMA10 > weekly EMA20 AND weekly close > weekly EMA20.
- Daily conditions (all required): EMA20 > EMA50; EMA50[D] > EMA50[D-1]; Low[D] <= EMA20[D]; Close[D] > EMA20[D]; Close[D] > High[D-1]; weekly regime true.
- Entry: D+1 open plus 1.5 pips of friction (0.0001 EUR/GBP/AUD; 0.01 JPY).
- Risk: ATR14 from signal day D (frozen Wilder-style ewm alpha=1/14, adjust=False, min_periods=14).
- Stop = entry - 1 ATR; target = entry + 2 ATR.
- Gap handling: open at/beyond stop exits at the actual open (gap_stop); open at/beyond target exits at the actual open (gap_target).
- Same-candle stop-and-target: stop first.
- Long only; one position at a time; scanning resumes from the exit day.
- Dataset end with open position: exit at the final available close; state recorded explicitly via open_at_end = 1.

## Phase-21 results (unambiguous metrics only)

| Pair | Trades | Wins | Losses | Win Rate | PF | Total R | Avg R | Median R | Max Losing Streak | Open-at-End |
|---|---|---|---|---|---|---|---|---|---|---|
| EURUSD | 141 | 52 | 89 | 36.88% | 1.169 | +15.09 | +0.1070 | -1.0000 | 10 | 0 |
| GBPUSD | 139 | 45 | 94 | 32.37% | 0.957 | -4.00 | -0.0288 | -1.0000 | 8 | 0 |
| AUDUSD | 111 | 36 | 75 | 32.43% | 0.960 | -2.98 | -0.0268 | -1.0000 | 8 | 0 |
| USDJPY | 101 | 31 | 70 | 30.69% | 0.886 | -8.00 | -0.0792 | -1.0000 | 7 | 0 |

Maximum drawdown: PENDING_UNRESOLVED_EQUITY_CONVENTION — no equity convention was specified, so no drawdown value is reported.

## Benchmark comparison (comparison ONLY — not labeled better or worse)

| Pair | Trades (benchmark) | Trades (observed) | PF (benchmark) | PF (observed) | Total R (benchmark) | Total R (observed) |
|---|---|---|---|---|---|---|
| EURUSD | 115 | 141 | 1.49 | 1.169 | 32.26 | +15.09 |
| GBPUSD | 152 | 139 | 1.04 | 0.957 | 4.4 | -4.00 |
| AUDUSD | 123 | 111 | 0.89 | 0.960 | -8.98 | -2.98 |
| USDJPY | 118 | 101 | 1.06 | 0.886 | 5.0 | -8.00 |

Historical benchmarks are forensic references only. They are not tolerance gates, optimization targets, or parameter-selection inputs.

## Exit-reason reconciliation (open_at_end vs dataset_end_close)

The authoritative reconstruction names the end-of-dataset exit concept `open_at_end`. The frozen implementation labels the exit reason `dataset_end_close` and additionally records `open_at_end = 1` as an explicit state flag.

Finding: **output-label / state-encoding difference only**. The exit price is the final available close, and the position is recorded as open at dataset end; no other exit is invented. Per instruction, the label is deliberately NOT changed for cosmetic consistency.

## Unresolved semantics (explicit — do not infer)

1. 16-window walk-forward: date structure known (T=2010..2025; train T-6..T-2, validation T-1, test T); replay independence, train as context-only, state carry-over, boundary trade assignment, capital reset, and boundary inclusivity are UNSPECIFIED. Not implemented.
2. V1-V13 definitions: NOT SPECIFIED. Not invented.
3. ADX14: informational only; directional-movement/smoothing/seed/alignment convention UNSPECIFIED. Ledger carries ADX14 = NaN; not implemented.
4. Maximum drawdown: PENDING_UNRESOLVED_EQUITY_CONVENTION.
5. 70/15/15 split: cutoff rounding and inclusivity UNSPECIFIED. No definitive split statistics are reported.

## Discrepancies versus benchmarks

Observed metrics differ from the historical benchmarks. Under the Level-3 rule, the implementation is NOT assumed wrong; investigated contributing factors (evidence in artifacts):

- Data source: EUR/USD now uses the authoritative eurusd_d.csv (broker-style 5-decimal candles, 2003-12 to 2026-09). The benchmarks were produced from a different snapshot/provider (the prior engine read eurusd_daily.csv).
- Dataset window: benchmarks cover older snapshots ending in the 2020s; the committed datasets extend through 2026-09, changing every weekly-regime state and downstream trade sequence.
- Indicator/EMA conventions: ewm(span, adjust=False) weekly and daily; the benchmark engine's exact EMA/ATR library and seeds are unknown.
- Entry/friction/bracket mechanics: verified against the frozen specification via the committed test suite; no mechanical deviation found.
- No parameter was changed to force agreement.

## Artifacts

- phase21_data_audit.csv — full data audit for all pairs.
- {pair}_phase21_trades.csv — per-pair deterministic trade ledgers.
- {pair}_phase21_stats.json — per-pair statistics.
- EURUSD_first_last_10_trades.csv — first and last ten EUR/USD trades.
- PHASE21_IMPLEMENTATION_FINGERPRINT.md — implemented-rule fingerprint.
- PHASE21_UNRESOLVED.md — unresolved semantics.
