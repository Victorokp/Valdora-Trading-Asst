# PHASE27_DATA_DICTIONARY.md

## Datasets

| File | SHA-256 | Rows | Range | Role |
|---|---|---|---|---|
| `eurusd_d.csv` | `e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52` | 14,270 | 1971-01-04 → 2026-09-25 | control dataset; Golden Reference filters to ≥ 2003-12-01 (5,914 rows) |
| `gbpusd_d.csv` | `e8f7c79ddf82409e623582b967d257a9d48b30e21db1081f21a8644235e8a189` | 5,908 | 2003-12-01 → 2026-09-24 | 27-E transfer |
| `usdjpy_d.csv` | `03f49d95dae6d9c04879186ce4c189712d393963de20b479faaf3ad5f8718656` | 5,913 | 2003-12-01 → 2026-09-24 | 27-E transfer |
| `audusd_d.csv` | `f23247fde8ceaa024e069c031d939311800e4bf708a8c59c27dba4c3d97ed6e3` | 5,906 | 2003-12-01 → 2026-09-24 | 27-E transfer |

Columns: `Date,Open,High,Low,Close`. No data row was modified, added, or
deleted by Phase 27.

## Splits (fixed; from the historical convention, empirically validated)

- **train**: `entry_date <= 2019-11-20`
- **validation**: `2019-11-20 < entry_date <= 2023-04-23`
- **final (evaluation only)**: `entry_date > 2023-04-23`

## Ledger columns (canonical; `phase27_baseline_trades.csv`)

Identical to the historical 115-row ledger: `signal_date`, `entry_date`,
`exit_date`, `entry_price` (next Open + 1.5 pips), `stop_price`
(entry − 1×ATR), `target_price` (entry + 2×ATR), `exit_price`, `atr_at_signal`
(signal-day ATR), `outcome` ∈ {stop, target, gap_stop, gap_target,
stop_assumed_first, open_at_data_end}, `r_multiple` =
(exit − entry)/(entry − stop), `split`.

## Enriched columns (27-A; `phase27_enriched_trades.csv`)

- `holding_period_days` = exit_date − entry_date (calendar days);
  `entry_bar`/`exit_bar`/`bars_held` = positional bar indices.
- `stop_distance` = entry − stop (= 1×ATR); `target_distance` =
  target − entry (= 2×ATR).
- `cond_weekly_ok`, `cond_daily_trend_ok`, `cond_pullback`, `cond_confirm` —
  the four daily signal conditions at the signal date (all True by
  construction; recorded for audit).
- `weekly_ema10`, `weekly_ema20`, `weekly_close` — values of the weekly bar
  in force at the signal date (completed-week backward mapping; a signal on
  a Friday maps to that same Friday's weekly bar, matching the Golden
  Reference mapping).
- `weekly_ema_separation_pct` = (EMA10w − EMA20w)/weekly_close;
  `price_vs_weekly_ema20_pct` = (weekly_close − EMA20w)/EMA20w.
- `ema20_ema50_gap` = EMA20 − EMA50 at signal; `ema20_ema50_gap_atr` =
  gap / signal ATR; `ema50_slope5` = EMA50 − EMA50.shift(5).
- `atr_pct` = signal ATR / signal Close.
- `atr_pctile_100` = rank of the signal-day ATR within the trailing 100-bar
  window ending at the signal bar (signal-inclusive; `min_periods=50`;
  no future rows). Causality: rolling window ends at the signal bar.
- `breakout_pips` = (signal Close − prior High)/0.0001;
  `breakout_atr` = breakout_pips×0.0001/signal ATR; `candle_range`,
  `candle_body`, `candle_range_atr` at the signal bar.
- `concurrent_positions` = number of ledger trades whose closed interval
  [entry_date, exit_date] contains this trade's entry or exit date
  (closed-interval overlap; includes the trade itself).
- `win_streak_at_exit`, `loss_streak_at_exit` — consecutive win/loss counts
  in exit-date order (loss = r_multiple ≤ 0).
- `exit_year`, `exit_month`, `exit_quarter` — exit-date calendar buckets.

## Metric conventions (fixed)

- R multiples: closed-trade R; (exit − entry)/(entry − stop).
- PF: sum of positive R ÷ |sum of negative R|, computed on resolved trades
  (open_at_data_end excluded); losses are R ≤ 0.
- total R: sum of r_multiple over the bucket, exit-date order.
- max drawdown R: min(cumulative R − running max) over exit-ordered closed
  trades, starting equity 0; reported negative.
- win rate: share of resolved bucket trades with R > 0.

## Feature causality guarantee

All 27-D/C2/C3/C5 features are computed from data at or before the signal
bar: trailing windows end at the signal bar; weekly values come from the
most recent completed weekly bar in force on the signal date (same-Friday
visibility is inherited from the Golden Reference mapping and is part of the
control's semantics, not a Phase-27 addition). No final-period information
entered any feature, threshold, or gate.
