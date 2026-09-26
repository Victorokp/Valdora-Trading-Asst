#!/usr/bin/env python3
"""Phase-27 Step 3 / Experiment 27-A: baseline reproduction + enriched diagnostics.

Loads the immutable PHASE-21 GOLDEN REFERENCE (phase21_historical_reference.py)
as a read-only module, re-executes its EUR/USD pipeline against the
authoritative dataset, and verifies the regenerated ledger is byte-identical
(SHA-256) to the historical 115-row artifact before building the enriched
trade table used by every Phase-27 diagnostic.

This script NEVER modifies the Golden Reference file, its parameters, or the
dataset. Diagnostic enrichment is additive only.

Outputs (phase27/results/):
  phase27_baseline_trades.csv     canonical ledger (must equal golden hash)
  phase27_enriched_trades.csv     ledger + 27-A diagnostic columns
  phase27_baseline_summary.json   headline metrics + integrity record
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "phase27"))

REFERENCE = ROOT / "phase21_historical_reference.py"
DATASET = ROOT / "eurusd_d.csv"
EXPECTED_LEDGER_SHA256 = (
    "30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0"
)
OUT = ROOT / "phase27" / "results"


def load_reference():
    spec = importlib.util.spec_from_file_location(
        "phase21_historical_reference", REFERENCE
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def run_baseline():
    OUT.mkdir(parents=True, exist_ok=True)
    ref = load_reference()

    daily = ref.load_daily(DATASET, ref.START_DATE)
    daily["EMA20"] = ref.ema(daily["Close"], 20)
    daily["EMA50"] = ref.ema(daily["Close"], 50)
    daily["EMA50_rising"] = daily["EMA50"] > daily["EMA50"].shift(5)
    daily["ATR"] = ref.atr(daily, 14)
    daily["PrevHigh"] = daily["High"].shift(1)
    weekly_ok = ref.build_weekly_filter(daily)
    daily["weekly_ok"] = ref.map_weekly_to_daily(daily, weekly_ok)
    daily["daily_trend_ok"] = (
        (daily["EMA20"] > daily["EMA50"]) & daily["EMA50_rising"]
    )
    daily["pullback"] = (
        (daily["Low"] <= daily["EMA20"]) & (daily["Close"] > daily["EMA20"])
    )
    daily["confirm"] = daily["Close"] > daily["PrevHigh"]
    daily["signal"] = (
        daily["weekly_ok"] & daily["daily_trend_ok"]
        & daily["pullback"] & daily["confirm"]
    )
    daily.loc[: ref.WARMUP - 1, "signal"] = False

    trades = ref.simulate_trades(daily, "signal")
    trades = ref.split_trades(trades, daily)
    baseline_path = OUT / "phase27_baseline_trades.csv"
    trades.to_csv(baseline_path, index=False)

    baseline_sha = sha256_file(baseline_path)
    if baseline_sha != EXPECTED_LEDGER_SHA256:
        raise SystemExit(
            "PHASE 27 STOP CONDITION 1/2: baseline ledger SHA-256 "
            f"{baseline_sha} != historical {EXPECTED_LEDGER_SHA256}. "
            "Golden Reference reproduction failed; refusing to continue."
        )

    # ---- 27-A enrichment (additive diagnostics only) ----
    t = trades.copy()
    for col in ("signal_date", "entry_date", "exit_date"):
        t[col] = pd.to_datetime(t[col])
    t["holding_period_days"] = (t["exit_date"] - t["entry_date"]).dt.days
    date_pos = pd.Series(np.arange(len(daily)), index=daily["Date"])
    t["entry_bar"] = t["entry_date"].map(date_pos)
    t["exit_bar"] = t["exit_date"].map(date_pos)
    t["bars_held"] = t["exit_bar"] - t["entry_bar"] + 1
    t["stop_distance"] = t["entry_price"] - t["stop_price"]      # = 1 ATR
    t["target_distance"] = t["target_price"] - t["entry_price"]  # = 2 ATR

    # daily signal conditions + weekly regime at the signal date
    sig_row = daily.set_index("Date")
    for col in ("weekly_ok", "daily_trend_ok", "pullback", "confirm"):
        t[f"cond_{col}"] = t["signal_date"].map(sig_row[col]).astype(bool)
    t["weekly_separation"] = t["signal_date"].map(sig_row["EMA20"])  # placeholder
    # weekly regime detail at signal: weekly EMA10/EMA20/close
    w = daily.set_index("Date").resample("W-FRI").agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last"}
    ).dropna()
    w["EMA10"] = ref.ema(w["Close"], 10)
    w["EMA20"] = ref.ema(w["Close"], 20)
    w["ATR10"] = (
        pd.concat(
            [
                w["High"] - w["Low"],
                (w["High"] - w["Close"].shift(1)).abs(),
                (w["Low"] - w["Close"].shift(1)).abs(),
            ],
            axis=1,
        ).max(axis=1).ewm(alpha=1 / 10, adjust=False).mean()
    )
    last_friday = w.index.values
    pos = np.searchsorted(last_friday, t["signal_date"].values, side="left") - 1
    t["weekly_ema10"] = w["EMA10"].values[pos]
    t["weekly_ema20"] = w["EMA20"].values[pos]
    t["weekly_close"] = w["Close"].values[pos]
    t["weekly_ema_separation_pct"] = (
        (t["weekly_ema10"] - t["weekly_ema20"]) / t["weekly_close"]
    )
    t["price_vs_weekly_ema20_pct"] = (
        (t["weekly_close"] - t["weekly_ema20"]) / t["weekly_ema20"]
    )
    # daily trend geometry at signal
    drow = daily.set_index("Date")
    t["ema20_ema50_gap"] = t["signal_date"].map(drow["EMA20"] - drow["EMA50"])
    t["ema20_ema50_gap_atr"] = t["ema20_ema50_gap"] / t["atr_at_signal"]
    t["ema50_slope5"] = t["signal_date"].map(
        drow["EMA50"] - drow["EMA50"].shift(5)
    )
    t["atr_pct"] = t["atr_at_signal"] / t["signal_date"].map(drow["Close"])
    # volatility percentile: trailing 100-bar rank INCLUDING the signal bar
    atr_rank_values = daily["ATR"].rolling(100, min_periods=50).apply(
        lambda x: float((x <= x[-1]).mean()), raw=True
    )
    atr_rank = pd.Series(atr_rank_values.to_numpy(), index=daily["Date"])
    t["atr_pctile_100"] = t["signal_date"].map(atr_rank)
    # breakout context at signal
    t["breakout_pips"] = (
        (t["signal_date"].map(drow["Close"]) - t["signal_date"].map(drow["PrevHigh"]))
        / 0.0001
    )
    t["breakout_atr"] = t["breakout_pips"] * 0.0001 / t["atr_at_signal"]
    t["candle_range"] = t["signal_date"].map(drow["High"] - drow["Low"])
    t["candle_body"] = t["signal_date"].map((drow["Close"] - drow["Open"]).abs())
    t["candle_range_atr"] = t["candle_range"] / t["atr_at_signal"]

    # concurrency: closed-interval overlap on [entry_date, exit_date]
    entries = t["entry_date"].values
    exits = t["exit_date"].values
    n = len(t)
    concurrent = np.zeros(n, dtype=int)
    for i in range(n):
        concurrent[i] = int(
            np.sum((entries <= exits[i]) & (exits >= entries[i]))
        )
    t["concurrent_positions"] = concurrent

    # consecutive win/loss tags in exit-date order
    ordered = t.sort_values(["exit_date", "entry_date"]).reset_index()
    win_streak = loss_streak = 0
    w_tags = np.zeros(n, dtype=int)
    l_tags = np.zeros(n, dtype=int)
    for row in ordered.itertuples():
        r = row.r_multiple
        if r > 0:
            win_streak += 1
            loss_streak = 0
        else:
            loss_streak += 1
            win_streak = 0
        w_tags[row.index] = win_streak
        l_tags[row.index] = loss_streak
    t["win_streak_at_exit"] = w_tags
    t["loss_streak_at_exit"] = l_tags

    # calendar helpers
    t["exit_year"] = t["exit_date"].dt.year
    t["exit_month"] = t["exit_date"].dt.to_period("M").astype(str)
    t["exit_quarter"] = t["exit_date"].dt.to_period("Q").astype(str)

    enriched_path = OUT / "phase27_enriched_trades.csv"
    t.to_csv(enriched_path, index=False)

    # headline metrics (closed-R convention, exit-date order)
    resolved = t.sort_values("exit_date")
    rs = resolved["r_multiple"]
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    cum = rs.cumsum()
    max_dd = float((cum - cum.cummax()).min())
    summary = {
        "python": sys.version.split()[0],
        "pandas": pd.__version__,
        "numpy": np.__version__,
        "golden_reference_sha256": sha256_file(REFERENCE),
        "dataset_sha256": sha256_file(DATASET),
        "baseline_ledger_sha256": baseline_sha,
        "expected_ledger_sha256": EXPECTED_LEDGER_SHA256,
        "ledger_byte_identical": baseline_sha == EXPECTED_LEDGER_SHA256,
        "trades": int(len(t)),
        "win_rate_pct": round(float((rs > 0).mean()) * 100.0, 4),
        "profit_factor": round(float(wins.sum() / -losses.sum()), 4),
        "total_R": round(float(rs.sum()), 4),
        "max_drawdown_R": round(max_dd, 4),
        "gap_stop_count": int((t["outcome"] == "gap_stop").sum()),
        "gap_target_count": int((t["outcome"] == "gap_target").sum()),
        "stop_count": int((t["outcome"] == "stop").sum()),
        "target_count": int((t["outcome"] == "target").sum()),
        "open_at_data_end": int((t["outcome"] == "open_at_data_end").sum()),
        "max_concurrent_positions": int(t["concurrent_positions"].max()),
        "avg_concurrent_positions": round(float(t["concurrent_positions"].mean()), 4),
        "enriched_table_sha256": sha256_file(enriched_path),
    }
    with open(OUT / "phase27_baseline_summary.json", "w") as fh:
        json.dump(summary, fh, indent=2)
    print(json.dumps(summary, indent=2))
    return t


if __name__ == "__main__":
    run_baseline()
