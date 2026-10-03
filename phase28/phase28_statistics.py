#!/usr/bin/env python3
"""Phase-28 statistics: OOS descriptives, bootstrap, Monte Carlo, regimes.

All analyses run on the OOS trade set (entry years 2010-2025) produced by
phase28_walk_forward.py. Randomized analyses use recorded seeds and are
deterministic. Nothing here modifies the strategy; all classifications are
descriptive and entry-time causal.

Outputs: phase28/results/phase28_statistics.json
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "eurusd_d.csv"
OUT = ROOT / "phase28" / "results"
BOOTSTRAP_SEED = 20280926
BOOTSTRAP_ITERS = 10000
MONTECARLO_SEED = 20280927
MONTECARLO_ITERS = 10000

PAIRS = {
    "GBPUSD": {"file": "gbpusd_d.csv", "pip": 0.0001},
    "USDJPY": {"file": "usdjpy_d.csv", "pip": 0.01},
    "AUDUSD": {"file": "audusd_d.csv", "pip": 0.0001},
}
START_DATE = "2003-12-01"


def load_reference():
    spec = importlib.util.spec_from_file_location(
        "phase21_historical_reference", ROOT / "phase21_historical_reference.py"
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


def losing_streak(rs) -> int:
    streak = worst = 0
    for r in rs:
        if r <= 0:
            streak += 1
            worst = max(worst, streak)
        else:
            streak = 0
    return worst


def descriptives(rs: pd.Series) -> dict:
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    payoff = (float(wins.mean() / -losses.mean())
              if len(wins) and len(losses) and losses.mean() != 0 else None)
    return {
        "n": int(len(rs)),
        "mean_R": round(float(rs.mean()), 4),
        "median_R": round(float(rs.median()), 4),
        "std_R": round(float(rs.std(ddof=1)), 4),
        "skewness": round(float(rs.skew()), 4),
        "win_rate_pct": round(float((rs > 0).mean() * 100.0), 4),
        "payoff_ratio_avgWin_over_avgLoss": round(payoff, 4)
        if payoff else None,
        "profit_factor": (round(float(wins.sum() / -losses.sum()), 4)
                          if len(losses) else None),
        "expectancy_R_per_trade": round(float(rs.mean()), 4),
        "max_drawdown_R": round(
            float((rs.cumsum() - rs.cumsum().cummax()).min()), 4),
        "maximum_losing_streak": int(losing_streak(rs.tolist())),
    }


def temporal_by_year(oos: pd.DataFrame) -> dict:
    out = {}
    for year, sub in oos.groupby("entry_year"):
        rs = sub.sort_values("exit_date")["r_multiple"]
        wins = int((rs > 0).sum())
        losses = int((rs <= 0).sum())
        stats = period_stats(sub)
        out[str(int(year))] = {
            "trades": stats["trades"],
            "wins": wins,
            "losses": losses,
            "win_rate_pct": stats["win_rate_pct"],
            "profit_factor": stats["profit_factor"],
            "total_R": stats["total_R"],
            "max_drawdown_R": stats["max_drawdown_R"],
            "small_sample_flag": bool(stats["trades"] < 10),
        }
    return out


def oos_features(oos: pd.DataFrame, daily: pd.DataFrame, ref) -> pd.DataFrame:
    """Entry-time features for regime descriptives (causal)."""
    t = oos.copy()
    atr_values = daily["ATR"].rolling(100, min_periods=50).apply(
        lambda x: float((x <= x[-1]).mean()), raw=True
    )
    atr_rank = pd.Series(atr_values.to_numpy(), index=daily["Date"])
    drow = daily.set_index("Date")
    t["atr_pctile_100"] = t["signal_date"].map(atr_rank)
    t["atr_pct"] = t["signal_date"].map(drow["ATR"]) / t["signal_date"].map(
        drow["Close"])
    t["ema_gap_atr"] = (
        t["signal_date"].map(drow["EMA20"] - drow["EMA50"])
    ) / t["atr_at_signal"]
    t["breakout_atr"] = (
        (t["signal_date"].map(drow["Close"])
         - t["signal_date"].map(drow["PrevHigh"])) / 0.0001
        * 0.0001 / t["atr_at_signal"]
    )
    t["candle_range_atr"] = (
        t["signal_date"].map(drow["High"] - drow["Low"]) / t["atr_at_signal"]
    )
    w = daily.set_index("Date").resample("W-FRI").agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last"}
    ).dropna()
    w["EMA10"] = ref.ema(w["Close"], 10)
    w["EMA20"] = ref.ema(w["Close"], 20)
    w["sep"] = (w["EMA10"] - w["EMA20"]) / w["Close"]
    idx = np.searchsorted(w.index.values, t["signal_date"].values,
                          side="left") - 1
    t["weekly_sep"] = w["sep"].values[np.clip(idx, 0, None)]
    return t


def regime_descriptives(t: pd.DataFrame) -> dict:
    out = {}
    specs = {
        "vol_regime_atr_pct": (
            "atr_pct",
            {"low": (0.0, 0.005), "mid": (0.005, 0.010),
             "high": (0.010, 1.0)},
        ),
        "atr_pctile_100": (
            "atr_pctile_100",
            {"below_33": (-0.01, 1 / 3), "33_67": (1 / 3, 2 / 3),
             "above_67": (2 / 3, 1.01)},
        ),
        "trend_strength_ema_gap_atr": (
            "ema_gap_atr",
            {"q1_narrow": None, "q2": None, "q3_wide": None},
        ),
        "breakout_magnitude_atr": (
            "breakout_atr",
            {"q1_small": None, "q2": None, "q3_large": None},
        ),
        "weekly_separation": (
            "weekly_sep",
            {"below_025pct": (-1.0, 0.0025),
             "above_025pct": (0.0025, 99.0)},
        ),
    }
    for name, (col, buckets) in specs.items():
        rows = {}
        if any(v is None for v in buckets.values()):
            qs = pd.qcut(t[col], len(buckets),
                         labels=list(buckets.keys()))
            for label in buckets:
                mask = qs == label
                if mask.any():
                    rows[label] = period_stats(t[mask])
        else:
            for label, (lo, hi) in buckets.items():
                mask = (t[col] >= lo) & (t[col] < hi)
                if mask.any():
                    rows[label] = period_stats(t[mask])
        out[name] = rows
    return out


def concentration(oos: pd.DataFrame) -> dict:
    rs = oos.sort_values("exit_date")["r_multiple"]
    total = float(rs.sum())
    srt = rs.sort_values(ascending=False)
    n = len(rs)
    out = {"oos_total_R": round(total, 4), "oos_trades": n}
    for k in (1, 3, 5, 10):
        if n >= 3 * k:  # meaningfulness guard
            out[f"total_R_after_removing_best_{k}"] = round(
                float(total - srt.iloc[:k].sum()), 4)
        else:
            out[f"total_R_after_removing_best_{k}"] = (
                "NOT_MEANINGFUL_oos_sample_too_small")
    out["top1_share_of_gross_profit"] = round(
        float(srt.iloc[0] / rs[rs > 0].sum()), 4) if (rs > 0).any() else None
    return out


def bootstrap(oos: pd.DataFrame) -> dict:
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    rs = oos.sort_values("exit_date")["r_multiple"].to_numpy()
    n = len(rs)
    means = np.empty(BOOTSTRAP_ITERS)
    totals = np.empty(BOOTSTRAP_ITERS)
    dds = np.empty(BOOTSTRAP_ITERS)
    for i in range(BOOTSTRAP_ITERS):
        sample = rs[rng.integers(0, n, n)]
        means[i] = sample.mean()
        totals[i] = sample.sum()
        cum = np.cumsum(sample)
        dds[i] = (cum - np.maximum.accumulate(cum)).min()

    def interval(arr, lo=2.5, hi=97.5):
        return {
            "p2.5": round(float(np.percentile(arr, lo)), 4),
            "p50": round(float(np.percentile(arr, 50)), 4),
            "p97.5": round(float(np.percentile(arr, hi)), 4),
        }

    return {
        "seed": BOOTSTRAP_SEED,
        "iterations": BOOTSTRAP_ITERS,
        "note": ("descriptive uncertainty estimate on the OBSERVED OOS R "
                 "distribution; NOT a prediction interval for future "
                 "performance and NOT used to modify the strategy"),
        "mean_R": interval(means),
        "total_R": interval(totals),
        "max_drawdown_R": interval(dds, 2.5, 97.5),
        "pct_bootstrap_total_R_negative": round(
            float((totals < 0).mean() * 100.0), 4),
    }


def monte_carlo(oos: pd.DataFrame) -> dict:
    rng = np.random.default_rng(MONTECARLO_SEED)
    rs = oos.sort_values("exit_date")["r_multiple"].to_numpy()
    n = len(rs)
    dds = np.empty(MONTECARLO_ITERS)
    streaks = np.empty(MONTECARLO_ITERS, dtype=int)
    for i in range(MONTECARLO_ITERS):
        perm = rs[rng.permutation(n)]
        cum = np.cumsum(perm)
        dds[i] = (cum - np.maximum.accumulate(cum)).min()
        streaks[i] = losing_streak(perm)
    return {
        "seed": MONTECARLO_SEED,
        "iterations": MONTECARLO_ITERS,
        "median_max_DD": round(float(np.percentile(dds, 50)), 4),
        "p5_max_DD": round(float(np.percentile(dds, 5)), 4),
        "p95_max_DD": round(float(np.percentile(dds, 95)), 4),
        "median_longest_losing_streak": int(np.percentile(streaks, 50)),
        "p95_longest_losing_streak": int(np.percentile(streaks, 95)),
        "terminal_cum_R_p2.5": round(float(np.percentile(rs.sum(), 2.5)), 4),
        "terminal_cum_R_p97.5": round(float(np.percentile(rs.sum(), 97.5)), 4),
        "terminal_cum_R_note": ("order-invariant; identical for every "
                                "permutation of the same trade set"),
    }


def cross_pair(ref) -> dict:
    out = {}
    for pair, cfg in PAIRS.items():
        path = ROOT / cfg["file"]
        saved_pip = ref.PIP
        ref.PIP = cfg["pip"]
        try:
            daily = ref.load_daily(path, START_DATE)
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
                (daily["Low"] <= daily["EMA20"])
                & (daily["Close"] > daily["EMA20"]))
            daily["confirm"] = daily["Close"] > daily["PrevHigh"]
            daily["signal"] = (
                daily["weekly_ok"] & daily["daily_trend_ok"]
                & daily["pullback"] & daily["confirm"])
            daily.loc[: ref.WARMUP - 1, "signal"] = False
            trades = ref.simulate_trades(daily, "signal")
        finally:
            ref.PIP = saved_pip
        entry_year = pd.to_datetime(trades["entry_date"]).dt.year
        full = period_stats(trades)
        # EURUSD-comparable OOS slice: entry years 2010-2025
        oos_slice = trades[entry_year.isin(range(2010, 2026))]
        out[pair] = {
            "full_history": full,
            "oos_2010_2025": period_stats(oos_slice),
            "note": "secondary question; no pair-specific tuning",
        }
    return out


def c3_comparison(oos: pd.DataFrame, daily: pd.DataFrame, ref) -> dict:
    """Rejected-candidate comparison, frozen constants, evaluation only."""
    atr_values = daily["ATR"].rolling(100, min_periods=50).apply(
        lambda x: float((x <= x[-1]).mean()), raw=True)
    atr_rank = pd.Series(atr_values.to_numpy(), index=daily["Date"])
    mask = oos["signal_date"].map(atr_rank) >= 0.10
    return {
        "status": "rejected Phase-27 candidate; frozen constants; no tuning",
        "control_oos": period_stats(oos),
        "c3_oos_subset": period_stats(oos[mask.fillna(False)]),
        "excluded_oos_trades": int((~mask.fillna(False)).sum()),
    }


def main() -> None:
    oos = pd.read_csv(OUT / "PHASE28_OOS_TRADES.csv")
    for col in ("signal_date", "entry_date", "exit_date"):
        oos[col] = pd.to_datetime(oos[col])
    ref = load_reference()
    daily = ref.load_daily(DATASET, ref.START_DATE)
    daily["EMA20"] = ref.ema(daily["Close"], 20)
    daily["EMA50"] = ref.ema(daily["Close"], 50)
    daily["EMA50_rising"] = daily["EMA50"] > daily["EMA50"].shift(5)
    daily["ATR"] = ref.atr(daily, 14)
    daily["PrevHigh"] = daily["High"].shift(1)

    enriched = oos_features(oos, daily, ref)
    results = {
        "oos_descriptives": descriptives(
            oos.sort_values("exit_date")["r_multiple"]),
        "temporal_by_entry_year": temporal_by_year(oos),
        "regime_conditional_oos": regime_descriptives(enriched),
        "concentration_oos": concentration(oos),
        "bootstrap": bootstrap(oos),
        "monte_carlo": monte_carlo(oos),
        "cross_pair_secondary": cross_pair(ref),
        "c3_comparison": c3_comparison(oos, daily, ref),
        "seeds": {"bootstrap": BOOTSTRAP_SEED, "monte_carlo": MONTECARLO_SEED},
    }
    with open(OUT / "phase28_statistics.json", "w") as fh:
        json.dump(results, fh, indent=2)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
