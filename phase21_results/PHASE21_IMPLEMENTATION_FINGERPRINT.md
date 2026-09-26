# Phase-21 Implementation Fingerprint

- Source file: `phase21_reconstruction.py`
- Source SHA-256: `a83e794f401630a03ba9d386be7f99bf3aa8a8e58939586b83428a6d9e78ca5d`
- Strategy direction: long only.
- Weekly resample: `W-FRI`, OHLC aggregation, exact Friday matches allowed.
- Weekly regime: `WeeklyEMA10 > WeeklyEMA20` and weekly close `> WeeklyEMA20`.
- Weekly alignment: backward `merge_asof` from weekly labels to daily dates.
- Daily EMA: pandas `ewm(span=20/50, adjust=False)`.
- Daily slope: `EMA50[D] > EMA50[D-1]`.
- Signal: weekly regime, `EMA20 > EMA50`, rising EMA50, `Low[D] <= EMA20[D]`, `Close[D] > EMA20[D]`, `Close[D] > High[D-1]`.
- ATR: true range with prior close; `ewm(alpha=1/14, adjust=False, min_periods=14)`.
- ATR timing: ATR14 from signal day D.
- Entry: next day's raw open plus `1.5` pips.
- Pip sizes: EURUSD/GBPUSD/AUDUSD `0.0001`; USDJPY `0.01`.
- Stop: entry minus `1 ATR`.
- Target: entry plus `2 ATR`.
- Gap handling: stop and target gaps fill at the opening price.
- Intraday ambiguity: if stop and target both touch, stop fills first.
- Position state: one position at a time; scanning resumes from exit day.
- End handling: remaining position closes at final available close; `exit_reason=dataset_end_close` with `open_at_end=1` state flag.
- ADX: not calculated; ledger column is explicit `NaN`.
- Walk-forward execution: not implemented.
- V1-V13 reconciliation: not implemented.
- Drawdown/equity calculation: not implemented.
- Date-split assignment: not implemented.
- Optimization, tolerances, and benchmark matching: not implemented.

The generated source hash fingerprints the executable core, not the unresolved reporting semantics.
