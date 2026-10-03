#!/usr/bin/env python3
"""Phase-27 Steps 7-9: candidate evaluation under pre-registered gates.

Implements the five pre-registered candidates (C1..C5) as separate engines.
The Golden Reference file is never modified; the reference module is loaded
read-only and its functions reused.

Contamination discipline:
  - Gate checks (acceptance) use ONLY train + validation buckets
    (entry_date <= 2023-04-23).
  - The final bucket (entry_date > 2023-04-23) is evaluated ONLY for
    candidates that were already frozen by the gates, and the evaluation is
    reported as-is (good or bad). It is never used to select, tune, or
    re-freeze anything.

Threshold provenance (Gate A): C2/C3/C5 thresholds were derived from
train+validation data only (documented in PHASE27_EXPERIMENT_REGISTRY.md),
before any final-period evaluation.

Outputs: phase27/results/phase27_experiments.json
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from phase27.phase27_baseline import (  # noqa: E402
    DATASET,
    OUT,
    load_reference,
    sha256_file,
)

RESULTS = OUT / "phase27_experiments.json"

# pre-registered constants (see registry)
TRAIN_END = pd.Timestamp("2019-11-20")
VAL_END = pd.Timestamp("2023-04-23")
C2_WEEKLY_SEPARATION_MIN = 0.0025
C3_ATR_PCTILE_MIN = 0.10

# gate constants (registry, Gate B / Gate E)
GATE_TRAIN_MIN_R = 17.00          # >= 70% of control train R (24.26)
GATE_VAL_MIN_R = -2.00            # strictly above control validation R
GATE_VAL_MIN_TRADES = 5
GATE_MAX_YEAR_SHARE = 0.60
RNG_SEED = 20260926  # unused by candidates; determinism note only


def period_stats(sub: pd.DataFrame) -> dict:
    if len(sub) == 0:
        return {"trades": 0, "total_R": 0.0, "profit_factor": None,
                "win_rate_pct": None, "average_R": None, "max_drawdown_R": 0.0}
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
        "average_R": round(float(rs.mean()), 4),
        "max_drawdown_R": round(float((cum - cum.cummax()).min()), 4),
    }


def build_daily(ref):
    """Golden pipeline on the authoritative dataset (read-only reuse)."""
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

    # entry-available feature columns (causal: rolling includes signal bar)
    daily["atr_pctile_100"] = daily["ATR"].rolling(100, min_periods=50).apply(
        lambda x: float((x <= x[-1]).mean()), raw=True
    )
    w = daily.set_index("Date").resample("W-FRI").agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last"}
    ).dropna()
    w["EMA10"] = ref.ema(w["Close"], 10)
    w["EMA20"] = ref.ema(w["Close"], 20)
    w["sep"] = (w["EMA10"] - w["EMA20"]) / w["Close"]
    idx = np.searchsorted(
        w.index.values, daily["Date"].values, side="left"
    ) - 1
    daily["weekly_sep"] = np.where(
        idx >= 0, w["sep"].values[np.clip(idx, 0, None)], np.nan
    )
    return daily


def golden_trades(ref, daily):
    trades = ref.simulate_trades(daily, "signal")
    trades = ref.split_trades(trades, daily)
    return trades


def filter_trades(trades: pd.DataFrame, mask_col: str) -> pd.DataFrame:
    """Filter candidates remove signals pre-entry; execution rules untouched.
    Implemented as a ledger subset by signal_date (equivalent to pre-entry
    signal masking because signals are unique per row in the golden ledger)."""
    return trades[trades[mask_col]].copy()


def concurrency_engine(ref, daily, cap: int) -> pd.DataFrame:
    """Separate engine: golden execution, plus a position gate at signal time.
    Same entry/friction/stop/target/gap/stop-first/end handling as the Golden
    Reference; only the number of allowed simultaneous positions differs."""
    friction = ref.FRICTION_PIPS * ref.PIP
    n = len(daily)
    signal_idxs = daily.index[daily["signal"]].tolist()
    trades = []
    open_until = []  # list of exit bar positions for open trades

    for i in signal_idxs:
        # gate: count positions still open as of this signal day
        live = sum(1 for e in open_until if e >= i)
        if live >= cap:
            continue
        entry_i = i + 1
        if entry_i >= n:
            continue
        sig_atr = daily.loc[i, "ATR"]
        if pd.isna(sig_atr) or sig_atr <= 0:
            continue
        entry_price = daily.loc[entry_i, "Open"] + friction
        stop_price = entry_price - 1.0 * sig_atr
        target_price = entry_price + 2.0 * sig_atr
        risk = entry_price - stop_price
        if risk <= 0:
            continue
        exit_price = exit_date = outcome = None
        for j in range(entry_i, n):
            o = daily.loc[j, "Open"]
            lo = daily.loc[j, "Low"]
            hi = daily.loc[j, "High"]
            if o <= stop_price:
                exit_price, outcome, ex_i = o, "gap_stop", j
                break
            elif o >= target_price:
                exit_price, outcome, ex_i = o, "gap_target", j
                break
            hit_stop = lo <= stop_price
            hit_target = hi >= target_price
            if hit_stop and hit_target:
                exit_price, outcome, ex_i = stop_price, "stop_assumed_first", j
                break
            elif hit_stop:
                exit_price, outcome, ex_i = stop_price, "stop", j
                break
            elif hit_target:
                exit_price, outcome, ex_i = target_price, "target", j
                break
        if exit_price is None:
            ex_i = n - 1
            exit_price = daily.loc[n - 1, "Close"]
            outcome = "open_at_data_end"
        exit_date = daily.loc[ex_i, "Date"]
        open_until.append(ex_i)
        trades.append({
            "signal_date": daily.loc[i, "Date"],
            "entry_date": daily.loc[entry_i, "Date"],
            "exit_date": exit_date,
            "entry_price": entry_price,
            "stop_price": stop_price,
            "target_price": target_price,
            "exit_price": exit_price,
            "atr_at_signal": sig_atr,
            "outcome": outcome,
            "r_multiple": (exit_price - entry_price) / risk,
        })
    return pd.DataFrame(trades)


def tag_splits(trades: pd.DataFrame) -> pd.DataFrame:
    t = trades.copy()
    t["entry_date"] = pd.to_datetime(t["entry_date"])
    t["split"] = np.where(
        t["entry_date"] <= TRAIN_END, "train",
        np.where(t["entry_date"] <= VAL_END, "validation", "final"),
    )
    return t


def year_gate(t: pd.DataFrame) -> dict:
    tv = t[t["split"].isin(["train", "validation"])]
    years = pd.to_datetime(tv["entry_date"]).dt.year
    yearly = tv.groupby(years)["r_multiple"].sum()
    total = float(yearly.sum())
    best = float(yearly.max()) if len(yearly) else 0.0
    return {
        "positive_years": int((yearly > 0).sum()),
        "total_years": int(len(yearly)),
        "best_year_share_of_tv_total_R": (
            round(best / total, 4) if total > 0 else None
        ),
        "yearly_total_R": {str(int(y)): round(float(v), 4)
                           for y, v in yearly.items()},
    }


def evaluate_candidate(cid: str, t: pd.DataFrame, frozen: bool) -> dict:
    tv = t[t["split"].isin(["train", "validation"])]
    train = t[t["split"] == "train"]
    validation = t[t["split"] == "validation"]

    train_R = float(train["r_multiple"].sum()) if len(train) else 0.0
    val_R = float(validation["r_multiple"].sum()) if len(validation) else 0.0
    val_trades = len(validation)

    gate_b = (
        (val_R > GATE_VAL_MIN_R)
        and (val_trades >= GATE_VAL_MIN_TRADES)
        and (train_R >= GATE_TRAIN_MIN_R)
    )
    yg = year_gate(t)
    gate_e = (
        (yg["positive_years"] >= yg["total_years"] / 2)
        and (
            yg["best_year_share_of_tv_total_R"] is None
            or yg["best_year_share_of_tv_total_R"] <= GATE_MAX_YEAR_SHARE
        )
    )
    gates = {
        "A_no_test_contamination": True,  # thresholds pre-registered
        "B_validation_evidence": bool(gate_b),
        "D_structural_rule": True,        # single pre-registered thresholds
        "E_cross_period": bool(gate_e),
        "F_economic_plausibility": True,  # stated per candidate in registry
        "G_reproducible": True,           # deterministic, no RNG
    }
    decision = "FROZEN" if all(gates.values()) else "REJECTED"

    out = {
        "candidate": cid,
        "train": period_stats(train),
        "validation": period_stats(validation),
        "train_validation_combined": period_stats(tv),
        "year_gate": yg,
        "gates": gates,
        "decision": decision,
    }
    if frozen and decision == "FROZEN":
        # evaluation of an ALREADY-FROZEN candidate on the final period
        final = t[t["split"] == "final"]
        out["final_evaluation_after_freeze"] = period_stats(final)
    return out


def main() -> None:
    ref = load_reference()
    daily = build_daily(ref)
    golden = tag_splits(golden_trades(ref, daily))

    # control reference values for the gates
    control = {
        "train": period_stats(golden[golden["split"] == "train"]),
        "validation": period_stats(golden[golden["split"] == "validation"]),
    }

    # feature columns for filter candidates, mapped by signal_date
    feats = daily.set_index("Date")[["weekly_sep", "atr_pctile_100"]]
    golden["weekly_sep"] = pd.to_datetime(
        golden["signal_date"]
    ).map(feats["weekly_sep"])
    golden["atr_pctile_100"] = pd.to_datetime(
        golden["signal_date"]
    ).map(feats["atr_pctile_100"])

    candidates = {}

    # C1 concurrency cap 1
    c1 = tag_splits(concurrency_engine(ref, daily, cap=1))
    candidates["C1_concurrency_cap_1"] = evaluate_candidate("C1", c1, True)

    # C2 weekly separation floor
    m2 = golden["weekly_sep"] >= C2_WEEKLY_SEPARATION_MIN
    c2 = tag_splits(filter_trades(golden, None)) if False else None
    c2 = tag_splits(golden[m2.fillna(False)].copy())
    candidates["C2_weekly_separation_floor"] = evaluate_candidate("C2", c2, True)

    # C3 volatility percentile floor
    m3 = golden["atr_pctile_100"] >= C3_ATR_PCTILE_MIN
    c3 = tag_splits(golden[m3.fillna(False)].copy())
    candidates["C3_vol_percentile_floor"] = evaluate_candidate("C3", c3, True)

    # C4 concurrency cap 2
    c4 = tag_splits(concurrency_engine(ref, daily, cap=2))
    candidates["C4_concurrency_cap_2"] = evaluate_candidate("C4", c4, True)

    # C5 quality combo (C2 AND C3, same thresholds)
    m5 = m2.fillna(False) & m3.fillna(False)
    c5 = tag_splits(golden[m5].copy())
    candidates["C5_quality_combo"] = evaluate_candidate("C5", c5, True)

    results = {
        "integrity": {
            "golden_reference_sha256": sha256_file(
                ROOT / "phase21_historical_reference.py"
            ),
            "dataset_sha256": sha256_file(DATASET),
            "python": sys.version.split()[0],
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "rng_seed": RNG_SEED,
            "note": "candidates are deterministic; seed unused",
        },
        "control": control,
        "gate_constants": {
            "GATE_TRAIN_MIN_R": GATE_TRAIN_MIN_R,
            "GATE_VAL_MIN_R": GATE_VAL_MIN_R,
            "GATE_VAL_MIN_TRADES": GATE_VAL_MIN_TRADES,
            "GATE_MAX_YEAR_SHARE": GATE_MAX_YEAR_SHARE,
            "C2_WEEKLY_SEPARATION_MIN": C2_WEEKLY_SEPARATION_MIN,
            "C3_ATR_PCTILE_MIN": C3_ATR_PCTILE_MIN,
        },
        "candidates": candidates,
    }
    with open(RESULTS, "w") as fh:
        json.dump(results, fh, indent=2)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
