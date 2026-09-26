#!/usr/bin/env python3
"""Phase-27 diagnostics: experiments 27-B .. 27-J on the Golden Reference.

All analyses are descriptive/diagnostic. No strategy change, no filter, no
optimization. Reads phase27/results/phase27_baseline_trades.csv (the
byte-identical Golden Reference ledger) and, for 27-E / 27-F, re-executes the
Golden Reference logic read-only. Writes phase27_diagnostics.json.

Experiment groups implemented here:
  27-B return distribution
  27-C temporal stability (year / quarter / month / rolling 12m)
  27-D market-regime descriptives (entry-available information only)
  27-E multi-currency transfer (GBPUSD, USDJPY, AUDUSD; golden logic)
  27-F execution-friction sensitivity grid (0.0 .. 4.0 pips)
  27-G exit-mechanism distribution
  27-H position-concurrency analysis (+ diagnostic single-position subset)
  27-I trade-order randomization (seeded; ledger untouched)
  27-J walk-forward descriptive windows (entry-year re-bucketing)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from phase27.phase27_baseline import (  # noqa: E402
    DATASET,
    EXPECTED_LEDGER_SHA256,
    OUT,
    load_reference,
    sha256_file,
)

RESULTS = OUT / "phase27_diagnostics.json"
RNG_SEED = 20260926
PERMUTATIONS = 10000

PAIRS = {
    "GBPUSD": {"file": "gbpusd_d.csv", "pip": 0.0001},
    "USDJPY": {"file": "usdjpy_d.csv", "pip": 0.01},
    "AUDUSD": {"file": "audusd_d.csv", "pip": 0.0001},
}
START_DATE = "2003-12-01"
FRICTION_GRID = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0]


def period_stats(sub: pd.DataFrame, order_col: str = "exit_date") -> dict:
    if len(sub) == 0:
        return {
            "trades": 0, "total_R": 0.0, "profit_factor": None,
            "win_rate_pct": None, "average_R": None, "max_drawdown_R": 0.0,
        }
    ordered = sub.sort_values(order_col)
    rs = ordered["r_multiple"]
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    cum = rs.cumsum()
    return {
        "trades": int(len(sub)),
        "total_R": round(float(rs.sum()), 4),
        "profit_factor": (
            round(float(wins.sum() / -losses.sum()), 4) if len(losses) else None
        ),
        "win_rate_pct": round(float((rs > 0).mean() * 100.0), 4),
        "average_R": round(float(rs.mean()), 4),
        "max_drawdown_R": round(float((cum - cum.cummax()).min()), 4),
    }


def dist_27b(t: pd.DataFrame) -> dict:
    rs = t.sort_values("exit_date")["r_multiple"]
    total = float(rs.sum())
    srt = rs.sort_values(ascending=False)
    out = {
        "total_R": round(total, 4),
        "mean_R": round(float(rs.mean()), 4),
        "median_R": round(float(rs.median()), 4),
        "std_R": round(float(rs.std(ddof=1)), 4),
        "skewness": round(float(rs.skew()), 4),
        "top1_share_of_gross_profit": round(
            float(srt.iloc[0] / rs[rs > 0].sum()), 4
        ) if (rs > 0).any() else None,
        "top3_share_of_gross_profit": round(
            float(srt.iloc[:3].sum() / rs[rs > 0].sum()), 4
        ) if (rs > 0).any() else None,
        "top5_share_of_gross_profit": round(
            float(srt.iloc[:5].sum() / rs[rs > 0].sum()), 4
        ) if (rs > 0).any() else None,
        "top10_share_of_gross_profit": round(
            float(srt.iloc[:10].sum() / rs[rs > 0].sum()), 4
        ) if (rs > 0).any() else None,
        "bottom1_R": round(float(srt.iloc[-1]), 4),
        "bottom3_R": round(float(srt.iloc[-3:].sum()), 4),
        "bottom5_R": round(float(srt.iloc[-5:].sum()), 4),
        "percentiles_R": {
            f"p{p}": round(float(np.percentile(rs, p)), 4)
            for p in (5, 10, 25, 50, 75, 90, 95)
        },
        "pct_totalR_from_wins": round(float(rs[rs > 0].sum() / total * 100.0), 4)
        if total else None,
        "pct_totalR_from_losses": round(float(rs[rs <= 0].sum() / total * 100.0), 4)
        if total else None,
        "totalR_after_removing_best_N": {
            f"top{n}": round(float(rs.sum() - srt.iloc[:n].sum()), 4)
            for n in (1, 3, 5, 10)
        },
    }
    out["robustness_verdict_diagnostics"] = {
        f"still_positive_after_top{n}":
            out["totalR_after_removing_best_N"][f"top{n}"] > 0
            for n in (1, 3, 5, 10)
    }
    return out


def temporal_27c(t: pd.DataFrame) -> dict:
    out = {}
    for key, col in (("year", "exit_year"), ("quarter", "exit_quarter"),
                     ("month", "exit_month")):
        rows = {}
        for value, sub in t.sort_values("exit_date").groupby(col):
            rows[str(value)] = period_stats(sub)
        out[key] = rows
    # rolling 12-month windows by exit month (calendar months, min 1 trade)
    tm = t.copy()
    tm["exit_ts"] = pd.to_datetime(tm["exit_date"])
    tm = tm.set_index("exit_ts").sort_index()
    rolling = {}
    monthly_R = tm["r_multiple"].resample("MS").sum()
    monthly_count = tm["r_multiple"].resample("MS").count()
    for end in monthly_R.index[11:]:
        win = monthly_R.loc[end - pd.offsets.MonthBegin(11): end]
        n = int(monthly_count.loc[end - pd.offsets.MonthBegin(11): end].sum())
        cum = win.cumsum()
        rolling[str(end.date())] = {
            "trades": n,
            "total_R": round(float(win.sum()), 4),
            "min_monthly_R": round(float(win.min()), 4),
            "max_drawdown_R": round(float((cum - cum.cummax()).min()), 4),
        }
    out["rolling_12m"] = rolling
    return out


def regime_27d(t: pd.DataFrame) -> dict:
    """Descriptive only: bucket entry-available variables, report outcome."""
    out = {}
    specs = {
        "weekly_ema_separation_pct": {"labels": ["q1_low", "q2", "q3", "q4_high"],
                                      "qcut": 4},
        "atr_pctile_100": {"labels": ["below_33", "33_67", "above_67"],
                           "bins": [-0.01, 1 / 3, 2 / 3, 1.01]},
        "breakout_atr": {"labels": ["q1_low", "q2", "q3_high"], "qcut": 3},
        "ema20_ema50_gap_atr": {"labels": ["q1_narrow", "q2", "q3", "q4_wide"],
                                "qcut": 4},
        "candle_range_atr": {"labels": ["q1_small", "q2", "q3_large"], "qcut": 3},
    }
    for col, spec in specs.items():
        if spec.get("qcut"):
            buckets = pd.qcut(t[col], spec["qcut"], labels=spec["labels"])
        else:
            buckets = pd.cut(t[col], bins=spec["bins"], labels=spec["labels"])
        rows = {}
        for label in spec["labels"]:
            mask = buckets == label
            if mask.any():
                rows[label] = period_stats(t[mask])
        out[col] = rows
    return out


def _run_golden(ref, path: Path, pip: float, friction_pips: float):
    """Execute the Golden Reference pipeline read-only with temporary module
    constants (pip/friction) set at runtime; always restored. The file itself
    is never modified."""
    saved_pip, saved_friction = ref.PIP, ref.FRICTION_PIPS
    ref.PIP, ref.FRICTION_PIPS = pip, friction_pips
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
            (daily["Low"] <= daily["EMA20"]) & (daily["Close"] > daily["EMA20"])
        )
        daily["confirm"] = daily["Close"] > daily["PrevHigh"]
        daily["signal"] = (
            daily["weekly_ok"] & daily["daily_trend_ok"]
            & daily["pullback"] & daily["confirm"]
        )
        daily.loc[: ref.WARMUP - 1, "signal"] = False
        return ref.simulate_trades(daily, "signal"), ref.split_trades
    finally:
        ref.PIP, ref.FRICTION_PIPS = saved_pip, saved_friction


def transfer_27e(ref) -> dict:
    out = {}
    for pair, cfg in PAIRS.items():
        path = ROOT / cfg["file"]
        if not path.exists():
            out[pair] = {"error": f"dataset {cfg['file']} not present"}
            continue
        trades, split = _run_golden(ref, path, cfg["pip"], 1.5)
        trades = split(trades, _daily_for_split(ref, path, cfg["pip"]))
        entry_year = pd.to_datetime(trades["entry_date"]).dt.year
        yearly = {
            str(int(y)): period_stats(trades[entry_year == y])
            for y in sorted(entry_year.unique())
        }
        stats = period_stats(trades)
        stats.update(
            {
                "win_rate_pct": stats["win_rate_pct"],
                "average_R": stats["average_R"],
                "max_drawdown_R": stats["max_drawdown_R"],
                "dataset_sha256": sha256_file(path),
                "yearly_total_R": {
                    y: v["total_R"] for y, v in yearly.items()
                },
                "positive_years": sum(
                    1 for v in yearly.values() if v["total_R"] > 0
                ),
                "total_years": len(yearly),
            }
        )
        out[pair] = stats
    return out


def _daily_for_split(ref, path: Path, pip: float):
    """Rebuild the daily frame for split-boundary derivation (same filter)."""
    return ref.load_daily(path, START_DATE)


def friction_27f(ref) -> list:
    rows = []
    for pips in FRICTION_GRID:
        trades, split = _run_golden(ref, DATASET, 0.0001, pips)
        trades = split(trades, ref.load_daily(DATASET, START_DATE))
        row = {"friction_pips": pips}
        row.update(period_stats(trades))
        if pips == 1.5:
            row["is_control"] = True
        rows.append(row)
    return rows


def exits_27g(t: pd.DataFrame) -> dict:
    out = {}
    total = float(t["r_multiple"].sum())
    for reason, sub in t.groupby("outcome"):
        stats = period_stats(sub)
        stats["pct_of_total_R"] = round(
            float(sub["r_multiple"].sum() / total * 100.0), 4
        )
        stats["avg_holding_days"] = round(
            float(sub["holding_period_days"].mean()), 4
        )
        out[str(reason)] = stats
    return out


def concurrency_27h(t: pd.DataFrame) -> dict:
    out = {
        "overlapping_trades": int((t["concurrent_positions"] > 1).sum()),
        "max_concurrent": int(t["concurrent_positions"].max()),
        "avg_concurrent": round(float(t["concurrent_positions"].mean()), 4),
        "by_level": {},
    }
    total = float(t["r_multiple"].sum())
    for label, mask in (
        ("1", t["concurrent_positions"] == 1),
        ("2", t["concurrent_positions"] == 2),
        ("3", t["concurrent_positions"] == 3),
        ("4+", t["concurrent_positions"] >= 4),
    ):
        stats = period_stats(t[mask])
        stats["pct_of_total_R"] = round(
            float(t.loc[mask, "r_multiple"].sum() / total * 100.0), 4
        ) if total else None
        out["by_level"][label] = stats
    # diagnostic single-position greedy subset (NOT a replacement; diagnostic)
    ordered = t.sort_values(["entry_date", "signal_date"]).reset_index(drop=True)
    keep, last_exit = [], None
    for pos, row in enumerate(ordered.itertuples()):
        entry = pd.Timestamp(row.entry_date)
        exit_ = pd.Timestamp(row.exit_date)
        if last_exit is None or entry > last_exit:
            keep.append(pos)
            last_exit = exit_
    out["single_position_diagnostic_subset"] = period_stats(
        ordered.iloc[keep].sort_values("exit_date")
    )
    out["single_position_note"] = (
        "greedy earliest-entry non-overlapping subset of the SAME golden "
        "ledger; diagnostic comparison only, not a candidate"
    )
    return out


def order_27i(t: pd.DataFrame) -> dict:
    rng = np.random.default_rng(RNG_SEED)
    rs = t.sort_values("exit_date")["r_multiple"].to_numpy()
    n = len(rs)
    max_dds = np.empty(PERMUTATIONS)
    streaks = np.empty(PERMUTATIONS, dtype=int)
    for i in range(PERMUTATIONS):
        perm = rng.permutation(rs)
        cum = np.cumsum(perm)
        max_dds[i] = (cum - np.maximum.accumulate(cum)).min()
        worst = cur = 0
        for r in perm:
            if r <= 0:
                cur += 1
                worst = max(worst, cur)
            else:
                cur = 0
        streaks[i] = worst
    actual_cum = np.cumsum(rs)
    actual_dd = float((actual_cum - np.maximum.accumulate(actual_cum)).min())
    def pct(p):
        return round(float(np.percentile(max_dds, p)), 4)
    return {
        "permutations": PERMUTATIONS,
        "seed": RNG_SEED,
        "terminal_R": round(float(rs.sum()), 4),
        "terminal_R_note": "order-invariant (sum)",
        "actual_order_max_dd": round(actual_dd, 4),
        "max_dd_percentiles": {
            "p5": pct(5), "p25": pct(25), "median": pct(50),
            "p75": pct(75), "p95": pct(95),
        },
        "max_dd_worse_than_actual_pct": round(
            float((max_dds < actual_dd).mean() * 100.0), 4
        ),
        "longest_losing_streak_percentiles": {
            "p5": int(np.percentile(streaks, 5)),
            "median": int(np.percentile(streaks, 50)),
            "p95": int(np.percentile(streaks, 95)),
        },
        "actual_longest_losing_streak": int(
            load_reference().max_losing_streak(rs.tolist())
        ),
    }


def walkforward_27j(t: pd.DataFrame) -> dict:
    rows = []
    for Y in range(2004, 2020):
        entry_year = pd.to_datetime(t["entry_date"]).dt.year
        train = t[(entry_year >= Y) & (entry_year <= Y + 4)]
        val = t[entry_year == Y + 5]
        test = t[entry_year == Y + 6]
        rows.append({
            "anchor": Y,
            "train_years": f"{Y}-{Y+4}", "val_year": Y + 5, "test_year": Y + 6,
            "train": period_stats(train), "validation": period_stats(val),
            "test": period_stats(test),
        })
    pooled = t[pd.to_datetime(t["entry_date"]).dt.year.isin(range(2010, 2026))]
    return {"windows": rows, "pooled_test_2010_2025": period_stats(pooled)}


def main() -> None:
    enriched = pd.read_csv(OUT / "phase27_enriched_trades.csv")
    for col in ("signal_date", "entry_date", "exit_date"):
        enriched[col] = pd.to_datetime(enriched[col])
    trades = enriched
    ref = load_reference()

    diagnostics = {
        "integrity": {
            "golden_reference_sha256": sha256_file(
                ROOT / "phase21_historical_reference.py"
            ),
            "dataset_sha256": sha256_file(DATASET),
            "baseline_ledger_sha256": sha256_file(
                OUT / "phase27_baseline_trades.csv"
            ),
            "expected_ledger_sha256": EXPECTED_LEDGER_SHA256,
            "ledger_byte_identical": sha256_file(
                OUT / "phase27_baseline_trades.csv"
            ) == EXPECTED_LEDGER_SHA256,
            "python": sys.version.split()[0],
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "seed_27i": RNG_SEED,
        },
        "B_return_distribution": dist_27b(trades),
        "C_temporal_stability": temporal_27c(trades),
        "D_regime_descriptives": regime_27d(enriched),
        "E_multi_currency_transfer": transfer_27e(ref),
        "F_friction_sensitivity": friction_27f(ref),
        "G_exit_distribution": exits_27g(trades),
        "H_concurrency": concurrency_27h(enriched),
        "I_trade_order_robustness": order_27i(trades),
        "J_walkforward_descriptive": walkforward_27j(trades),
    }
    with open(RESULTS, "w") as fh:
        json.dump(diagnostics, fh, indent=2)
    print(json.dumps(diagnostics["integrity"], indent=2))
    print("27-B", json.dumps(diagnostics["B_return_distribution"], indent=2))
    print("27-F", json.dumps(diagnostics["F_friction_sensitivity"], indent=2))
    print("27-H", json.dumps(diagnostics["H_concurrency"], indent=2))
    print("27-I", json.dumps(diagnostics["I_trade_order_robustness"], indent=2))
    print("27-E", json.dumps(diagnostics["E_multi_currency_transfer"], indent=2))


if __name__ == "__main__":
    main()
