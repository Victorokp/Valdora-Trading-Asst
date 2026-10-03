#!/usr/bin/env python3
"""Phase-21 RECONCILIATION EXPERIMENT (isolated; experiment branch only).

Goal: determine whether the five confirmed historical semantic differences
fully explain the current 141-trade / +15.09R result versus the historical
115-trade / +32.26R benchmark, WITHOUT touching the authoritative
phase21_reconstruction.py and WITHOUT tuning anything.

The variant implements ONLY these five evidence-backed historical semantics:

  H1  Multi-position concurrency, phase14.py::simulate_trades exact:
      every qualifying signal may open a trade; no position-state check.
      (phase14.py: `for i in signal_idxs:` — each signal handled independently.)

  H2  EMA50 rising exactly as the historical source (phase21.py):
      EMA50_rising = EMA50 > EMA50.shift(5)
      ("Daily trend: ... EMA50 rising (EMA50 > EMA50 five days ago ...)")
      Not reinterpreted.

  H3  Historical data window + warm-up, phase21.py/phase14.py exact:
      - load_daily(..., start_date="2003-12-01"): parse -> sort by Date ->
        drop rows with missing OHLC -> keep rows with Date >= 2003-12-01.
        Dataset: the authoritative eurusd_d.csv (14,270 rows, 1971-01-04 ..
        2026-09-25) -> filtered subset 5,914 rows (2003-12-01 .. 2026-09-25).
      - 60-bar warm-up: after indicators and signal are computed,
        phase21.py executes `warmup = 60; daily.loc[: warmup - 1, "signal"]
        = False`. Mechanism: it ZEROES the signal column on rows 0..59 of
        the post-filter frame (positional slice, 60 rows). It does NOT drop
        rows, does NOT shorten indicator history, and does not touch ATR or
        EMA values; it only forbids a trade from being generated from a
        signal in the first 60 post-filter rows (2003-12-01 .. ~2004-03-02).
        Indicator state still warms from the 2003-12-01 start of the subset.

  H4  Historical ATR exactly as implemented in phase14.py::atr:
      - TR definition: pd.concat([High - Low, (High - prev_close).abs(),
        (Low - prev_close).abs()], axis=1).max(axis=1), with
        prev_close = Close.shift(1). On the first row prev_close is NaN, so
        those two terms are NaN and max(axis=1) (NaN-skipping) yields TR[0]
        = High[0] - Low[0].
      - Smoothing: tr.ewm(alpha=1/14, adjust=False).mean() — recursive
        Wilder-style exponential smoothing, y[0] = TR[0],
        y[t] = (1 - 1/14) * y[t-1] + (1/14) * TR[t].
      - Initialization/warm-up: NO min_periods and NO seed row override;
        the series is finite from row 0 onward (first valid ATR row = 0,
        value = High[0] - Low[0] of the filtered frame). Bars 0..13 are
        "warm-up" only in the sense of a short average, not NaN.
      - Exact pandas operations: as quoted above — shift(1) on Close,
        concat of three Series, .max(axis=1), .ewm(alpha=1/period,
        adjust=False).mean().
      - Signal-day ATR is used: stop/target come from sig_atr =
        daily.loc[i, "ATR"] (the SIGNAL day's ATR), skipped if
        pd.isna(sig_atr) or sig_atr <= 0.

  H5  Historical 70/15/15 split exactly (phase14.py::split_trades with the
      boundaries this dataset produces, asserted below):
      entry_date <= 2019-11-20            -> "train"
      2019-11-20 < entry_date <= 2023-04-23 -> "validation"
      entry_date > 2023-04-23             -> "final"
      (phase14.py derives the boundaries as start + int(total_days*0.70)
      and start + int(total_days*0.85) from the filtered frame; both
      computed values are asserted equal to the fixed dates above.)

NOT CHANGED (shared axes, identical to both engines — verified in
PHASE21_HISTORICAL_PACKAGE_VERIFICATION.md section 5):
  - weekly W-FRI resample + regime + searchsorted(side="left")-1 mapping
    (same-Friday match included; equivalent to the current
    merge_asof backward allow_exact_matches=True),
  - entry at next bar Open + 1.5 pips friction,
  - stop = entry - 1*ATR, target = entry + 2*ATR (signal-day ATR),
  - gap handling: open <= stop -> gap_stop at open; open >= target ->
    gap_target at open,
  - same-candle precedence: stop assumed first at the stop price,
  - exit logic and end-of-data handling (exit at final Close, flagged),
  - all other signal conditions (weekly regime, EMA20>EMA50, Low<=EMA20,
    Close>EMA20, Close>PrevHigh), long-only.

Floats are produced with the same operation ORDER as phase14.py/phase21.py
so the ledger can be compared byte-for-byte with the historical artifact.

Reference ledger (from the uploaded forensic package):
  output/phase21_trades_ledger.csv, SHA-256
  30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "eurusd_d.csv"
OUT_DIR = ROOT / "phase21_experiment_results"
REFERENCE_LEDGER = Path(sys.argv[1]) if len(sys.argv) > 1 else None

PIP = 0.0001
FRICTION_PIPS = 1.5
STOP_MULT = 1.0
TARGET_MULT = 2.0
START_DATE = "2003-12-01"
WARMUP = 60
SPLIT_TRAIN = 0.70
SPLIT_VAL = 0.15
TRAIN_END_FIXED = pd.Timestamp("2019-11-20")
VAL_END_FIXED = pd.Timestamp("2023-04-23")


# ----------------------------------------------------------------- H3 data
def load_daily(path: Path, start_date: str) -> pd.DataFrame:
    """phase14.py::load_daily, operation-for-operation."""
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values("Date").reset_index(drop=True)
    for c in ["Open", "High", "Low", "Close"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["Open", "High", "Low", "Close"]).reset_index(drop=True)
    if start_date:
        df = df[df["Date"] >= pd.Timestamp(start_date)].reset_index(drop=True)
    return df


# ----------------------------------------------------------------- H4 ATR
def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """phase14.py::atr, operation-for-operation (H4 documentation above)."""
    prev_close = df["Close"].shift(1)
    tr = pd.concat(
        [
            df["High"] - df["Low"],
            (df["High"] - prev_close).abs(),
            (df["Low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


# ------------------------------------------- weekly filter (UNCHANGED axis)
def build_weekly_filter(daily: pd.DataFrame) -> pd.Series:
    w = (
        daily.set_index("Date")
        .resample("W-FRI")
        .agg({"Open": "first", "High": "max", "Low": "min", "Close": "last"})
        .dropna()
    )
    w["EMA10"] = ema(w["Close"], 10)
    w["EMA20"] = ema(w["Close"], 20)
    w["weekly_ok"] = (w["EMA10"] > w["EMA20"]) & (w["Close"] > w["EMA20"])
    return w["weekly_ok"]


def map_weekly_to_daily(daily: pd.DataFrame, weekly_ok: pd.Series) -> pd.Series:
    fridays = weekly_ok.index.values
    vals = weekly_ok.values
    daily_dates = daily["Date"].values
    idx = np.searchsorted(fridays, daily_dates, side="left") - 1
    result = np.full(len(daily), False)
    valid = idx >= 0
    result[valid] = vals[idx[valid]]
    return pd.Series(result, index=daily.index)


# ------------------------------------------------------------- H1 engine
def simulate_trades(daily: pd.DataFrame, signal_col: str) -> pd.DataFrame:
    """phase14.py::simulate_trades, operation-for-operation (H1: per-signal,
    no position-state restriction; friction/stop/target/gaps/stop-first/
    end-of-data identical to the frozen engine semantics)."""
    friction = FRICTION_PIPS * PIP
    n = len(daily)
    signal_idxs = daily.index[daily[signal_col]].tolist()
    trades = []

    for i in signal_idxs:
        entry_i = i + 1
        if entry_i >= n:
            continue
        sig_atr = daily.loc[i, "ATR"]
        if pd.isna(sig_atr) or sig_atr <= 0:
            continue
        entry_date = daily.loc[entry_i, "Date"]
        entry_price = daily.loc[entry_i, "Open"] + friction
        stop_price = entry_price - STOP_MULT * sig_atr
        target_price = entry_price + TARGET_MULT * sig_atr
        risk = entry_price - stop_price
        if risk <= 0:
            continue

        exit_price = None
        exit_date = None
        outcome = None

        for j in range(entry_i, n):
            o = daily.loc[j, "Open"]
            lo = daily.loc[j, "Low"]
            hi = daily.loc[j, "High"]

            gap_stop = o <= stop_price
            gap_target = o >= target_price

            if gap_stop:
                exit_price, outcome = o, "gap_stop"
                exit_date = daily.loc[j, "Date"]
                break
            elif gap_target:
                exit_price, outcome = o, "gap_target"
                exit_date = daily.loc[j, "Date"]
                break

            hit_stop = lo <= stop_price
            hit_target = hi >= target_price
            if hit_stop and hit_target:
                exit_price, outcome = stop_price, "stop_assumed_first"
                exit_date = daily.loc[j, "Date"]
                break
            elif hit_stop:
                exit_price, outcome = stop_price, "stop"
                exit_date = daily.loc[j, "Date"]
                break
            elif hit_target:
                exit_price, outcome = target_price, "target"
                exit_date = daily.loc[j, "Date"]
                break

        if exit_price is None:
            exit_price = daily.loc[n - 1, "Close"]
            outcome = "open_at_data_end"
            exit_date = daily.loc[n - 1, "Date"]

        r_multiple = (exit_price - entry_price) / risk
        trades.append(
            {
                "signal_date": daily.loc[i, "Date"],
                "entry_date": entry_date,
                "exit_date": exit_date,
                "entry_price": entry_price,
                "stop_price": stop_price,
                "target_price": target_price,
                "exit_price": exit_price,
                "atr_at_signal": sig_atr,
                "outcome": outcome,
                "r_multiple": r_multiple,
            }
        )

    return pd.DataFrame(trades)


# ----------------------------------------------------------------- H5 split
def split_trades(trades_df: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    """phase14.py::split_trades. Boundaries derived from the filtered frame
    and asserted equal to the fixed historical dates (H5)."""
    if len(trades_df) == 0:
        return trades_df
    dates = daily["Date"]
    start, end = dates.iloc[0], dates.iloc[-1]
    total_days = (end - start).days
    train_end = start + pd.Timedelta(days=int(total_days * SPLIT_TRAIN))
    val_end = start + pd.Timedelta(days=int(total_days * (SPLIT_TRAIN + SPLIT_VAL)))
    assert train_end == TRAIN_END_FIXED, f"{train_end} != {TRAIN_END_FIXED}"
    assert val_end == VAL_END_FIXED, f"{val_end} != {VAL_END_FIXED}"

    def bucket(d):
        if d <= train_end:
            return "train"
        elif d <= val_end:
            return "validation"
        else:
            return "final"

    trades_df = trades_df.copy()
    trades_df["split"] = trades_df["entry_date"].apply(bucket)
    return trades_df


def max_losing_streak(r_series):
    streak = 0
    worst = 0
    for r in r_series:
        if r <= 0:
            streak += 1
            worst = max(worst, streak)
        else:
            streak = 0
    return worst


def compute_stats(sub: pd.DataFrame) -> dict:
    """phase14.py::compute_stats, operation-for-operation."""
    resolved = sub[sub["outcome"] != "open_at_data_end"]
    n_trades = len(sub)
    n_resolved = len(resolved)
    if n_resolved == 0:
        return {
            "trade_count": n_trades, "resolved_count": 0, "win_rate": np.nan,
            "profit_factor": np.nan,
            "total_R": sub["r_multiple"].sum() if n_trades else 0.0,
            "expectancy_R": np.nan, "max_drawdown_R": np.nan,
            "worst_losing_streak": np.nan,
        }
    ordered = resolved.sort_values("exit_date")
    wins = ordered[ordered["r_multiple"] > 0]
    losses = ordered[ordered["r_multiple"] <= 0]
    win_rate = len(wins) / n_resolved
    gross_win = wins["r_multiple"].sum()
    gross_loss = -losses["r_multiple"].sum()
    profit_factor = (gross_win / gross_loss) if gross_loss > 0 else np.inf
    total_R = ordered["r_multiple"].sum()
    cum = ordered["r_multiple"].cumsum()
    running_max = cum.cummax()
    dd = cum - running_max
    max_dd = dd.min() if len(dd) else 0.0
    streak = max_losing_streak(ordered["r_multiple"].tolist())
    return {
        "trade_count": n_trades, "resolved_count": n_resolved,
        "win_rate": win_rate, "profit_factor": profit_factor,
        "total_R": total_R, "expectancy_R": total_R / n_resolved,
        "max_drawdown_R": max_dd, "worst_losing_streak": streak,
    }


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def first_divergence(mine: Path, reference: Path) -> None:
    """Row-by-row, column-by-column first-difference report."""
    a = pd.read_csv(mine)
    b = pd.read_csv(reference)
    print("\n--- FIRST-DIVERGENCE DIAGNOSTIC ---")
    print(f"rows: variant={len(a)} reference={len(b)}")
    width = max(len(a), len(b))
    for i in range(width):
        if i >= len(a) or i >= len(b):
            print(f"row {i}: present only in "
                  f"{'variant' if i < len(a) else 'reference'}: "
                  f"{(a.iloc[i].to_dict() if i < len(a) else b.iloc[i].to_dict())}")
            return
        ra, rb = a.iloc[i], b.iloc[i]
        for col in a.columns:
            va, vb = ra[col], rb[col]
            same = (va == vb) or (pd.isna(va) and pd.isna(vb))
            if not same:
                print(f"FIRST DIVERGENCE at row {i}, column '{col}':")
                print(f"  variant    : {va!r}")
                print(f"  reference  : {vb!r}")
                print(f"  full rows  :")
                print(f"    variant  : {ra.to_dict()}")
                print(f"    reference: {rb.to_dict()}")
                if col in {"signal_date", "entry_date"}:
                    d = pd.Timestamp(rb.get("signal_date", rb.get("entry_date")))
                    row = daily[daily["Date"] == d]
                    if len(row):
                        r0 = row.iloc[0]
                        print("    indicator values on that signal date:")
                        for k in ("Open", "High", "Low", "Close", "EMA20",
                                  "EMA50", "ATR", "weekly_ok", "signal"):
                            print(f"      {k}: {r0[k]!r}")
                return
    print("no differing row found (ledgers equal frame-wise)")


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)

    daily = load_daily(DATA_FILE, START_DATE)
    print(f"H3 data window: rows={len(daily)} "
          f"{daily['Date'].iloc[0].date()} .. {daily['Date'].iloc[-1].date()}")

    daily["EMA20"] = ema(daily["Close"], 20)
    daily["EMA50"] = ema(daily["Close"], 50)
    daily["EMA50_rising"] = daily["EMA50"] > daily["EMA50"].shift(5)  # H2
    daily["ATR"] = atr(daily, 14)  # H4
    daily["PrevHigh"] = daily["High"].shift(1)

    atr_first_valid = daily["ATR"].first_valid_index()
    print(f"H4 ATR: first valid row index = {atr_first_valid} "
          f"(date {daily['Date'].iloc[atr_first_valid].date()}), "
          f"ATR[0..3] = {[round(v, 10) for v in daily['ATR'].iloc[:4]]}")

    weekly_ok = build_weekly_filter(daily)
    daily["weekly_ok"] = map_weekly_to_daily(daily, weekly_ok)

    daily["daily_trend_ok"] = (daily["EMA20"] > daily["EMA50"]) & daily["EMA50_rising"]
    daily["pullback"] = (daily["Low"] <= daily["EMA20"]) & (daily["Close"] > daily["EMA20"])
    daily["confirm"] = daily["Close"] > daily["PrevHigh"]
    daily["signal"] = (
        daily["weekly_ok"] & daily["daily_trend_ok"] & daily["pullback"] & daily["confirm"]
    )
    raw_signals = int(daily["signal"].sum())

    # H3 warm-up: zero the signal column on rows 0..WARMUP-1 (phase21.py:
    # `warmup = 60; daily.loc[: warmup - 1, "signal"] = False`).
    daily.loc[: WARMUP - 1, "signal"] = False
    post_warmup_signals = int(daily["signal"].sum())
    print(f"H3 warm-up: raw signals={raw_signals}, "
          f"after zeroing rows 0..{WARMUP - 1} -> {post_warmup_signals}")

    trades_df = simulate_trades(daily, "signal")  # H1
    trades_df = split_trades(trades_df, daily)    # H5
    ledger_path = OUT_DIR / "phase21_trades.csv"
    trades_df.to_csv(ledger_path, index=False)

    overall = compute_stats(trades_df)
    print("\n=== H1-H5 VARIANT RESULTS (authoritative dataset) ===")
    print(f"OVERALL: trades={overall['trade_count']} "
          f"win_rate={overall.get('win_rate', float('nan')):.1%} "
          f"PF={overall.get('profit_factor', float('nan')):.2f} "
          f"totalR={overall.get('total_R', float('nan')):.2f} "
          f"avgR={overall.get('expectancy_R', float('nan')):.3f} "
          f"maxDD={overall.get('max_drawdown_R', float('nan')):.2f} "
          f"worstStreak={overall.get('worst_losing_streak', float('nan'))}")
    for s in ["train", "validation", "final"]:
        st = compute_stats(trades_df[trades_df["split"] == s])
        print(f"  {s:10s} trades={st['trade_count']:>4} "
              f"win_rate={st.get('win_rate', float('nan')):.1%} "
              f"PF={st.get('profit_factor', float('nan')):.2f} "
              f"totalR={st.get('total_R', float('nan')):.2f} "
              f"maxDD={st.get('max_drawdown_R', float('nan')):.2f}")

    outcomes = trades_df["outcome"].value_counts().to_dict() if len(trades_df) else {}
    print(f"outcomes: {outcomes}")

    print(f"\nG. ledger: {ledger_path}")
    print(f"   sha256 = {sha256_file(ledger_path)}")
    if REFERENCE_LEDGER is not None and Path(REFERENCE_LEDGER).exists():
        ref = Path(REFERENCE_LEDGER)
        print(f"   reference: {ref}")
        print(f"   ref sha256 = {sha256_file(ref)}")
        mine_bytes = ledger_path.read_bytes()
        ref_bytes = ref.read_bytes()
        if mine_bytes == ref_bytes:
            print("   BYTE-IDENTICAL to the historical 115-row ledger.")
        else:
            print("   NOT byte-identical; running first-divergence diagnostic.")
            first_divergence(ledger_path, ref)
    else:
        print("   (no reference ledger supplied; byte comparison skipped)")


if __name__ == "__main__":
    main()
