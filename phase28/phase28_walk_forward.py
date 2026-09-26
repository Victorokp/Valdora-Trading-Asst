#!/usr/bin/env python3
"""Phase-28 walk-forward validation of the Phase-21 Golden Reference.

Evaluation only. The strategy is identical in every window; nothing is
selected, tuned, or re-fitted. Produces:

  phase28/results/PHASE28_WALK_FORWARD_RESULTS.csv  (16-window table)
  phase28/results/PHASE28_OOS_TRADES.csv            (test trades only)
  phase28/results/PHASE28_OOS_EQUITY.csv            (OOS equity curve)
  phase28/results/phase28_wf_summary.json           (aggregates + integrity)

Walk-forward structure (historical, recovered): anchor Y = 2004..2019,
TRAIN [Y, Y+4] by entry year, VALIDATION Y+5, TEST Y+6 -> 16 test windows
covering 2010..2025. Trade bucketing by ENTRY year (Golden Reference
semantics; see PHASE28_DATA_AUDIT.md for boundary treatment).

OOS definition: a trade is out-of-sample iff its entry year >= 2010 and it
does not belong to any window's train or validation buckets (entry years
2004..2009 are train/validation only; entry years 2010..2025 are test-only).
The OOS equity curve contains OOS trades ONLY, exit-date ordered.
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
DATASET = ROOT / "eurusd_d.csv"
REFERENCE = ROOT / "phase21_historical_reference.py"
GOLDEN_LEDGER_SHA256 = (
    "30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0"
)
GOLDEN_REFERENCE_SHA256 = (
    "b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95"
)
DATASET_SHA256 = (
    "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52"
)
OUT = ROOT / "phase28" / "results"
ANCHORS = list(range(2004, 2020))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_reference():
    spec = importlib.util.spec_from_file_location(
        "phase21_historical_reference", REFERENCE
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def period_stats(sub: pd.DataFrame) -> dict:
    if len(sub) == 0:
        return {"trades": 0, "total_R": 0.0, "profit_factor": None,
                "win_rate_pct": None, "max_drawdown_R": 0.0}
    ordered = sub.sort_values("exit_date")
    rs = ordered["r_multiple"]
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    cum = rs.cumsum()
    return {
        "trades": int(len(sub)),
        "total_R": round(float(rs.sum()), 4),
        "profit_factor": (round(float(wins.sum() / -losses.sum()), 4)
                          if len(losses) else None),
        "win_rate_pct": round(float((rs > 0).mean() * 100.0), 4),
        "max_drawdown_R": round(float((cum - cum.cummax()).min()), 4),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- gate: Golden Reference verification must pass before validation ----
    checks = {
        "golden_reference_sha256": sha256_file(REFERENCE),
        "dataset_sha256": sha256_file(DATASET),
    }
    if checks["golden_reference_sha256"] != GOLDEN_REFERENCE_SHA256:
        raise SystemExit("PHASE 28 STOP: Golden Reference hash changed.")
    if checks["dataset_sha256"] != DATASET_SHA256:
        raise SystemExit("PHASE 28 STOP: dataset hash changed.")

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
    ledger_sha = sha256_file(_gate_check_ledger(trades))
    if ledger_sha != GOLDEN_LEDGER_SHA256:
        raise SystemExit(
            f"PHASE 28 STOP: ledger SHA {ledger_sha} != historical "
            f"{GOLDEN_LEDGER_SHA256}."
        )
    trades["entry_date"] = pd.to_datetime(trades["entry_date"])
    trades["exit_date"] = pd.to_datetime(trades["exit_date"])
    trades["entry_year"] = trades["entry_date"].dt.year
    trades["exit_year"] = trades["exit_date"].dt.year

    # ---- 16 windows (evaluation-only re-bucketing by entry year) ----
    rows = []
    for Y in ANCHORS:
        train = trades[(trades["entry_year"] >= Y)
                       & (trades["entry_year"] <= Y + 4)]
        val = trades[trades["entry_year"] == Y + 5]
        test = trades[trades["entry_year"] == Y + 6]
        rows.append({
            "window": len(rows) + 1,
            "anchor_year": Y,
            "train_period": f"{Y}-{Y + 4}",
            "validation_period": str(Y + 5),
            "test_period": str(Y + 6),
            "train_trades": period_stats(train)["trades"],
            "train_total_R": period_stats(train)["total_R"],
            "train_PF": period_stats(train)["profit_factor"],
            "train_win_rate_pct": period_stats(train)["win_rate_pct"],
            "train_max_DD_R": period_stats(train)["max_drawdown_R"],
            "val_trades": period_stats(val)["trades"],
            "val_total_R": period_stats(val)["total_R"],
            "val_PF": period_stats(val)["profit_factor"],
            "val_win_rate_pct": period_stats(val)["win_rate_pct"],
            "val_max_DD_R": period_stats(val)["max_drawdown_R"],
            "test_trades": period_stats(test)["trades"],
            "test_total_R": period_stats(test)["total_R"],
            "test_PF": period_stats(test)["profit_factor"],
            "test_win_rate_pct": period_stats(test)["win_rate_pct"],
            "test_max_DD_R": period_stats(test)["max_drawdown_R"],
        })
    wf = pd.DataFrame(rows)
    wf.to_csv(OUT / "PHASE28_WALK_FORWARD_RESULTS.csv", index=False)

    # ---- OOS trades: entry years 2010..2025 (test-only years) ----
    (OUT / "_gate_check_ledger.csv").unlink(missing_ok=True)
    oos = trades[trades["entry_year"].isin(range(2010, 2026))].copy()
    oos = oos.sort_values(["exit_date", "entry_date"]).reset_index(drop=True)
    oos.insert(0, "oos_seq", np.arange(1, len(oos) + 1))
    oos.to_csv(OUT / "PHASE28_OOS_TRADES.csv", index=False)

    # ---- OOS equity curve (OOS trades ONLY, exit-date order) ----
    eq = oos.sort_values("exit_date").reset_index(drop=True)
    eq["cum_R"] = eq["r_multiple"].cumsum()
    eq["running_max"] = eq["cum_R"].cummax()
    eq["drawdown_R"] = eq["cum_R"] - eq["running_max"]
    eq[["oos_seq", "signal_date", "entry_date", "exit_date", "outcome",
        "r_multiple", "cum_R", "running_max", "drawdown_R"]].to_csv(
        OUT / "PHASE28_OOS_EQUITY.csv", index=False
    )

    # ---- aggregates (section 7) ----
    rs = eq["r_multiple"]
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    # maximum losing streak (exit order; loss = r <= 0)
    streak = worst = 0
    for r in rs:
        if r <= 0:
            streak += 1
            worst = max(worst, streak)
        else:
            streak = 0
    test_Rs = wf["test_total_R"]
    test_stats = {
        "total_trades": int(wf["test_trades"].sum()),
        "total_R": round(float(rs.sum()), 4),
        "profit_factor": (round(float(wins.sum() / -losses.sum()), 4)
                          if len(losses) else None),
        "win_rate_pct": round(float((rs > 0).mean() * 100.0), 4),
        "average_R": round(float(rs.mean()), 4),
        "median_R": round(float(rs.median()), 4),
        "max_drawdown_R": round(float(eq["drawdown_R"].min()), 4),
        "maximum_losing_streak": int(worst),
        "profitable_test_windows": int((test_Rs > 0).sum()),
        "losing_test_windows": int((test_Rs < 0).sum()),
        "flat_test_windows": int((test_Rs == 0).sum()),
        "pct_profitable_windows": round(
            float((test_Rs > 0).mean() * 100.0), 4),
    }

    # ---- window return distribution (section 8) ----
    window_dist = {
        "best_test_window_R": round(float(test_Rs.max()), 4),
        "best_test_year": int(wf.loc[test_Rs.idxmax(), "test_period"]),
        "worst_test_window_R": round(float(test_Rs.min()), 4),
        "worst_test_year": int(wf.loc[test_Rs.idxmin(), "test_period"]),
        "median_test_window_R": round(float(test_Rs.median()), 4),
        "mean_test_window_R": round(float(test_Rs.mean()), 4),
        "std_test_window_R": round(float(test_Rs.std(ddof=1)), 4),
        "pct_positive_windows": round(float((test_Rs > 0).mean() * 100.0), 4),
        "cumulative_test_R": round(float(test_Rs.sum()), 4),
    }
    srt = test_Rs.sort_values(ascending=False)
    window_dist["top1_window_share_of_cum_R"] = round(
        float(srt.iloc[0] / test_Rs.sum()), 4) if test_Rs.sum() > 0 else None
    window_dist["top2_windows_share_of_cum_R"] = round(
        float(srt.iloc[:2].sum() / test_Rs.sum()), 4) if test_Rs.sum() > 0 else None
    window_dist["cum_R_excluding_best_window"] = round(
        float(test_Rs.sum() - srt.iloc[0]), 4)
    window_dist["cum_R_excluding_best_two_windows"] = round(
        float(test_Rs.sum() - srt.iloc[:2].sum()), 4)

    # ---- multi-position metrics on OOS (section 19) ----
    entries = oos["entry_date"].values
    exits = oos["exit_date"].values
    n = len(oos)
    concurrent = np.array([
        int(np.sum((entries <= exits[i]) & (exits >= entries[i])))
        for i in range(n)
    ])
    overlap_mask = concurrent > 1
    oos_total = float(rs.sum())
    multi = {
        "max_simultaneous_positions": int(concurrent.max()),
        "avg_simultaneous_positions": round(float(concurrent.mean()), 4),
        "overlapping_trades": int(overlap_mask.sum()),
        "oos_R_from_overlapping_trades": round(
            float(rs[overlap_mask].sum()), 4),
        "oos_R_from_single_trades": round(
            float(rs[~overlap_mask].sum()), 4),
        "pct_of_oos_total_R_from_overlaps": round(
            float(rs[overlap_mask].sum() / oos_total * 100.0), 4)
        if oos_total else None,
    }

    summary = {
        "integrity": {
            **checks,
            "ledger_sha256": ledger_sha,
            "ledger_byte_identical": ledger_sha == GOLDEN_LEDGER_SHA256,
            "python": sys.version.split()[0],
            "pandas": pd.__version__,
            "numpy": np.__version__,
        },
        "windows": len(rows),
        "test_year_range": "2010-2025",
        "test_only_aggregate": test_stats,
        "test_window_distribution": window_dist,
        "multi_position_oos": multi,
        "oos_trades_file_sha256": sha256_file(OUT / "PHASE28_OOS_TRADES.csv"),
        "oos_equity_file_sha256": sha256_file(OUT / "PHASE28_OOS_EQUITY.csv"),
        "walk_forward_csv_sha256": sha256_file(
            OUT / "PHASE28_WALK_FORWARD_RESULTS.csv"),
    }
    with open(OUT / "phase28_wf_summary.json", "w") as fh:
        json.dump(summary, fh, indent=2)
    print(json.dumps(summary, indent=2))


def _gate_check_ledger(trades: pd.DataFrame) -> Path:
    """Write the ledger to a temp path for hash-gating without touching any
    Phase-21/27 artifact; the temp file is removed by the caller's flow."""
    tmp = OUT / "_gate_check_ledger.csv"
    OUT.mkdir(parents=True, exist_ok=True)
    trades.to_csv(tmp, index=False)
    return tmp


if __name__ == "__main__":
    main()
