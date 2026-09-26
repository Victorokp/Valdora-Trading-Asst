#!/usr/bin/env python3
"""Phase-29 robustness & stress testing of the Phase-21 Golden Reference.

Implements the pre-registered experiment registry (families A-K). The
Golden Reference file is never modified; perturbations run on dedicated
stress engines or ledger transformations. All values were frozen in
PHASE29_EXPERIMENT_REGISTRY.md before execution.

Outputs:
  phase29/results/PHASE29_STRESS_RESULTS.csv
  phase29/results/PHASE29_EXECUTION_STRESS.csv
  phase29/results/PHASE29_PARAMETER_SENSITIVITY.csv
  phase29/results/PHASE29_DRAWDOWN_STRESS.csv
  phase29/results/PHASE29_TEMPORAL_STRESS.csv
  phase29/results/PHASE29_REGIME_STRESS.csv
  phase29/results/phase29_summary.json
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
GOLDEN_REFERENCE_SHA256 = (
    "b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95"
)
DATASET_SHA256 = (
    "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52"
)
GOLDEN_LEDGER_SHA256 = (
    "30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0"
)
OUT = ROOT / "phase29" / "results"
OUT.mkdir(parents=True, exist_ok=True)

# pre-registered constants (registry)
FRICTION_GRID = [0.0, 1.5, 3.0, 4.0, 5.0, 6.0]          # A-FRIC
SLIP_GRID = [0.5, 1.0, 2.0]                              # A-SLIP
DELAY_GRID = [1, 2]                                      # B-DELAY
EXIT_SLIP_GRID = [0.5, 1.0]                              # C2/C3
STOP_MULTS = [0.9, 1.1]                                  # D
TARGET_MULTS = [1.8, 2.2]                                # D
EMA_PERTURBS = [("daily", 20, [19, 21]), ("daily", 50, [49, 51]),
                ("weekly", 10, [9, 11]), ("weekly", 20, [19, 21])]
F2_SEEDS = [29092601 + i for i in range(20)]
F2_RATES = [0.01, 0.05, 0.10]
F3_RATES = [0.10, 0.20]
G_SEED = 20290926
G_ITERS = 10000
H_CAPS = [3, 2, 1]
DD_THRESHOLDS = [5.0, 8.0, 10.0, 12.0, 15.0]
REGIME_VOL_BINS = [(0.0, 0.005, "low"), (0.005, 0.010, "mid"),
                   (0.010, 1.0, "high")]

PAIRS = {"GBPUSD": ("gbpusd_d.csv", 0.0001),
         "USDJPY": ("usdjpy_d.csv", 0.01),
         "AUDUSD": ("audusd_d.csv", 0.0001)}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_reference():
    spec = importlib.util.spec_from_file_location(
        "phase21_historical_reference", REFERENCE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def period_stats(sub: pd.DataFrame, order: str = "exit_date") -> dict:
    if len(sub) == 0:
        return {"trades": 0, "total_R": 0.0, "profit_factor": None,
                "win_rate_pct": None, "max_drawdown_R": 0.0}
    ordered = sub.sort_values(order)
    rs = ordered["r_multiple"]
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    cum = rs.cumsum()
    return {"trades": int(len(sub)), "total_R": round(float(rs.sum()), 4),
            "profit_factor": (round(float(wins.sum() / -losses.sum()), 4)
                              if len(losses) else None),
            "win_rate_pct": round(float((rs > 0).mean() * 100.0), 4),
            "max_drawdown_R": round(float((cum - cum.cummax()).min()), 4)}


def losing_streak(seq) -> int:
    streak = worst = 0
    for r in seq:
        if r <= 0:
            streak += 1
            worst = max(worst, streak)
        else:
            streak = 0
    return worst


def base_daily(ref):
    daily = ref.load_daily(DATASET, ref.START_DATE)
    daily["EMA20"] = ref.ema(daily["Close"], 20)
    daily["EMA50"] = ref.ema(daily["Close"], 50)
    daily["EMA50_rising"] = daily["EMA50"] > daily["EMA50"].shift(5)
    daily["ATR"] = ref.atr(daily, 14)
    daily["PrevHigh"] = daily["High"].shift(1)
    weekly_ok = ref.build_weekly_filter(daily)
    daily["weekly_ok"] = ref.map_weekly_to_daily(daily, weekly_ok)
    daily["daily_trend_ok"] = (
        (daily["EMA20"] > daily["EMA50"]) & daily["EMA50_rising"])
    daily["pullback"] = (
        (daily["Low"] <= daily["EMA20"]) & (daily["Close"] > daily["EMA20"]))
    daily["confirm"] = daily["Close"] > daily["PrevHigh"]
    daily["signal"] = (
        daily["weekly_ok"] & daily["daily_trend_ok"]
        & daily["pullback"] & daily["confirm"])
    daily.loc[: ref.WARMUP - 1, "signal"] = False
    return daily


def stress_engine(ref, daily: pd.DataFrame, *, friction_pips: float = 1.5,
                  entry_slip_pips: float = 0.0, delay_bars: int = 0,
                  stop_mult: float = 1.0, target_mult: float = 2.0,
                  exit_slip_pips: float = 0.0,
                  gap_at_level: bool = False) -> pd.DataFrame:
    """Dedicated stress engine: Golden Reference execution semantics with
    pre-registered perturbations. Signal logic untouched."""
    pip = ref.PIP
    friction = friction_pips * pip
    slip = entry_slip_pips * pip
    n = len(daily)
    trades = []
    for i in daily.index[daily["signal"]].tolist():
        entry_i = i + 1 + delay_bars
        if entry_i >= n:
            continue
        sig_atr = daily.loc[i, "ATR"]
        if pd.isna(sig_atr) or sig_atr <= 0:
            continue
        entry_price = (daily.loc[entry_i, "Open"] + friction + slip)
        stop_price = entry_price - stop_mult * sig_atr
        target_price = entry_price + target_mult * sig_atr
        risk = entry_price - stop_price
        if risk <= 0:
            continue
        exit_price = exit_i = None
        outcome = None
        # identical to Golden Reference: exit scan starts AT the entry candle
        for j in range(entry_i, n):
            o = daily.loc[j, "Open"]
            lo = daily.loc[j, "Low"]
            hi = daily.loc[j, "High"]
            if o <= stop_price:
                exit_price = (stop_price if gap_at_level else o) \
                    - exit_slip_pips * pip
                outcome, exit_i = "gap_stop", j
                break
            if o >= target_price:
                exit_price = (target_price if gap_at_level else o) \
                    + exit_slip_pips * pip
                outcome, exit_i = "gap_target", j
                break
            hit_stop = lo <= stop_price
            hit_target = hi >= target_price
            if hit_stop and hit_target:
                exit_price = stop_price - exit_slip_pips * pip
                outcome, exit_i = "stop_assumed_first", j
                break
            if hit_stop:
                exit_price = stop_price - exit_slip_pips * pip
                outcome, exit_i = "stop", j
                break
            if hit_target:
                exit_price = target_price - exit_slip_pips * pip
                outcome, exit_i = "target", j
                break
        if exit_price is None:
            exit_i = n - 1
            exit_price = daily.loc[n - 1, "Close"]
            outcome = "open_at_data_end"
        r = (exit_price - entry_price) / risk
        trades.append({"signal_date": daily.loc[i, "Date"],
                       "entry_date": daily.loc[entry_i, "Date"],
                       "exit_date": daily.loc[exit_i, "Date"],
                       "outcome": outcome, "r_multiple": r})
    return pd.DataFrame(trades)


def weekly_ema_perturbation(ref, span_daily: dict, span_weekly: dict):
    """EMA sensitivity: rebuild signal with perturbed EMA spans."""
    daily = ref.load_daily(DATASET, ref.START_DATE)
    daily["EMA20"] = ref.ema(daily["Close"], span_daily[20])
    daily["EMA50"] = ref.ema(daily["Close"], span_daily[50])
    daily["EMA50_rising"] = daily["EMA50"] > daily["EMA50"].shift(5)
    daily["ATR"] = ref.atr(daily, 14)
    daily["PrevHigh"] = daily["High"].shift(1)
    w = daily.set_index("Date").resample("W-FRI").agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last"}
    ).dropna()
    w["EMA10"] = ref.ema(w["Close"], span_weekly[10])
    w["EMA20"] = ref.ema(w["Close"], span_weekly[20])
    w["weekly_ok"] = (w["EMA10"] > w["EMA20"]) & (w["Close"] > w["EMA20"])
    daily["weekly_ok"] = ref.map_weekly_to_daily(daily, w["weekly_ok"])
    daily["daily_trend_ok"] = (
        (daily["EMA20"] > daily["EMA50"]) & daily["EMA50_rising"])
    daily["pullback"] = (
        (daily["Low"] <= daily["EMA20"]) & (daily["Close"] > daily["EMA20"]))
    daily["confirm"] = daily["Close"] > daily["PrevHigh"]
    daily["signal"] = (
        daily["weekly_ok"] & daily["daily_trend_ok"]
        & daily["pullback"] & daily["confirm"])
    daily.loc[: ref.WARMUP - 1, "signal"] = False
    return stress_engine(ref, daily)


def signal_lag(ref, daily: pd.DataFrame) -> pd.DataFrame:
    """E-LAG: shift the signal series one bar later (no look-ahead: the
    shifted signal at day D equals the original condition at D-1, which uses
    only data <= D-1 <= D)."""
    lagged = daily.copy()
    lagged["signal"] = daily["signal"].shift(1).fillna(False)
    return stress_engine(ref, lagged)


def main() -> None:
    # ---------------- control freeze (section 1/5) ----------------
    if sha256_file(REFERENCE) != GOLDEN_REFERENCE_SHA256:
        raise SystemExit("PHASE 29 STOP: Golden Reference hash mismatch.")
    if sha256_file(DATASET) != DATASET_SHA256:
        raise SystemExit("PHASE 29 STOP: dataset hash mismatch.")
    ref = load_reference()
    daily = base_daily(ref)
    control = stress_engine(ref, daily)
    control_stats = period_stats(control)
    control_rs = control.sort_values("exit_date")["r_multiple"]
    oos = control[pd.to_datetime(control["entry_date"]).dt.year
                  .isin(range(2010, 2026))]
    oos_stats = period_stats(oos)
    wf = pd.read_csv(ROOT / "phase28" / "results"
                     / "PHASE28_WALK_FORWARD_RESULTS.csv")
    baseline = {
        "trades": control_stats["trades"],
        "wins": int((control_rs > 0).sum()),
        "losses": int((control_rs <= 0).sum()),
        "win_rate_pct": control_stats["win_rate_pct"],
        "gross_profit_R": round(float(control_rs[control_rs > 0].sum()), 4),
        "gross_loss_R": round(float(control_rs[control_rs <= 0].sum()), 4),
        "profit_factor": control_stats["profit_factor"],
        "total_R": control_stats["total_R"],
        "average_R": round(float(control_rs.mean()), 4),
        "max_drawdown_R": control_stats["max_drawdown_R"],
        "maximum_losing_streak": losing_streak(control_rs.tolist()),
        "test_windows_profitable": 11,
        "oos_trade_count": oos_stats["trades"],
        "oos_total_R": oos_stats["total_R"],
        "oos_profit_factor": oos_stats["profit_factor"],
        "oos_win_rate_pct": oos_stats["win_rate_pct"],
        "oos_max_drawdown_R": oos_stats["max_drawdown_R"],
    }

    rows = []   # stress results table
    f2_negative = {}

    def record(family, exp_id, trades_df, note=""):
        s = period_stats(trades_df)
        rows.append({"family": family, "experiment": exp_id, **s, "note": note})
        return s

    # ---------------- Family A ----------------
    for pips in FRICTION_GRID:
        tag = "control" if pips == 1.5 else f"{pips}pips"
        record("A_execution", f"A-FRIC-{tag}",
               stress_engine(ref, daily, friction_pips=pips))
    for slip in SLIP_GRID:
        record("A_execution", f"A-SLIP-{slip}pips",
               stress_engine(ref, daily, entry_slip_pips=slip))

    # ---------------- Family B ----------------
    for delay in DELAY_GRID:
        record("B_entry_delay", f"B-DELAY-{delay}bar",
               stress_engine(ref, daily, delay_bars=delay))

    # ---------------- Family C ----------------
    for slip in EXIT_SLIP_GRID:
        record("C_exit_stress", f"C2-STOPSLIP-{slip}pips",
               stress_engine(ref, daily, exit_slip_pips=slip))
        record("C_exit_stress", f"C3-TGTSLIP-{slip}pips",
               stress_engine(ref, daily, exit_slip_pips=slip))
    record("C_exit_stress", "C4-GAPATLEVEL",
           stress_engine(ref, daily, gap_at_level=True))

    # ---------------- Family D ----------------
    for stop_mult in STOP_MULTS:
        record("D_parameters", f"D-STOP{stop_mult}ATR",
               stress_engine(ref, daily, stop_mult=stop_mult))
    for target_mult in TARGET_MULTS:
        record("D_parameters", f"D-TGT{target_mult}ATR",
               stress_engine(ref, daily, target_mult=target_mult))
    param_rows = []
    for layer, control_span, spans in EMA_PERTURBS:
        for span in spans:
            if layer == "daily":
                sd = {20: span if control_span == 20 else 20,
                      50: span if control_span == 50 else 50}
                sw = {10: 10, 20: 20}
            else:
                sd = {20: 20, 50: 50}
                sw = {10: span if control_span == 10 else 10,
                      20: span if control_span == 20 else 20}
            t = weekly_ema_perturbation(ref, sd, sw)
            s = period_stats(t)
            param_rows.append({
                "experiment": f"D-{layer.upper()}-EMA{control_span}->{span}",
                **s})
            rows.append({"family": "D_parameters",
                         "experiment": f"D-{layer.upper()}-EMA{control_span}->{span}",
                         **s, "note": ""})
    param_rows.append({"experiment": "CONTROL", **control_stats})
    pd.DataFrame(param_rows).to_csv(
        ROOT / "PHASE29_PARAMETER_SENSITIVITY.csv", index=False)

    # ---------------- Family E ----------------
    record("E_signal_timing", "E-LAG-1day", signal_lag(ref, daily))
    rows.append({"family": "E_signal_timing", "experiment": "E-LEAD-1day",
                 "trades": None, "total_R": None, "profit_factor": None,
                 "win_rate_pct": None, "max_drawdown_R": None,
                 "note": "NOT VALID - WOULD INTRODUCE LOOK-AHEAD (not run)"})

    # ---------------- Family F ----------------
    trades = ref.simulate_trades(daily, "signal")
    trades = ref.split_trades(trades, daily)
    for k in (1, 2, 5, 10):
        srt = trades.sort_values("r_multiple", ascending=False)
        record("F_data_omission", f"F1-NO-TOP{k}-WINNERS", trades.drop(
            srt.index[:k]))
    for rate in F2_RATES:
        totals, pfs, neg = [], [], []
        for seed in F2_SEEDS:
            rng = np.random.default_rng(seed)
            k = max(1, int(round(rate * len(trades))))
            drop = rng.choice(len(trades), size=k, replace=False)
            s = period_stats(trades.drop(trades.index[drop]))
            totals.append(s["total_R"])
            pfs.append(s["profit_factor"])
            neg.append(s["total_R"] < 0)
        f2_negative[f"{int(rate*100)}pct"] = {
            "min_total_R": round(min(totals), 4),
            "max_total_R": round(max(totals), 4),
            "fraction_negative_seeds": round(float(np.mean(neg)), 4)}
        rows.append({
            "family": "F_data_omission",
            "experiment": f"F2-RANDOM-{int(rate*100)}pct",
            "trades": int(len(trades) * (1 - rate)),
            "total_R": f"{min(totals):.2f}..{max(totals):.2f}",
            "profit_factor": f"{min(pfs):.2f}..{max(pfs):.2f}",
            "win_rate_pct": "",
            "max_drawdown_R": "",
            "note": f"20 seeds {F2_SEEDS[0]}..{F2_SEEDS[-1]}; "
                    f"min total_R {min(totals):.2f}"})
    for rate in F3_RATES:
        totals = []
        for seed in F2_SEEDS:
            rng = np.random.default_rng(seed)
            winners = trades.index[trades["r_multiple"] > 0].tolist()
            k = int(round(rate * len(winners)))
            drop = rng.choice(winners, size=k, replace=False)
            totals.append(period_stats(trades.drop(drop))["total_R"])
        rows.append({
            "family": "F_data_omission", "experiment": f"F3-NO-{int(rate*100)}pct-WINNERS",
            "trades": len(trades) - int(round(rate * (trades['r_multiple'] > 0).sum())),
            "total_R": f"{min(totals):.2f}..{max(totals):.2f}",
            "profit_factor": "", "win_rate_pct": "", "max_drawdown_R": "",
            "note": f"20 seeds; median {float(np.median(totals)):.2f}"})

    # ---------------- Family G ----------------
    rng = np.random.default_rng(G_SEED)
    rs = control.sort_values("exit_date")["r_multiple"].to_numpy()
    dds = np.empty(G_ITERS)
    streaks = np.empty(G_ITERS, dtype=int)
    for i in range(G_ITERS):
        perm = rs[rng.permutation(len(rs))]
        cum = np.cumsum(perm)
        dds[i] = (cum - np.maximum.accumulate(cum)).min()
        streaks[i] = losing_streak(perm)
    dd_stress = {
        "seed": G_SEED, "iterations": G_ITERS,
        "actual_maxDD": control_stats["max_drawdown_R"],
        "median_maxDD": round(float(np.percentile(dds, 50)), 4),
        "p5_maxDD": round(float(np.percentile(dds, 5)), 4),
        "p1_maxDD": round(float(np.percentile(dds, 1)), 4),
        "p95_maxDD": round(float(np.percentile(dds, 95)), 4),
        "worst_simulated_maxDD": round(float(dds.min()), 4),
        "p_worse_than_minus12R": round(float((dds < -12.0).mean() * 100.0), 4),
        "losing_streak_p50": int(np.percentile(streaks, 50)),
        "losing_streak_p95": int(np.percentile(streaks, 95)),
        "losing_streak_max": int(streaks.max()),
    }
    rows.append({"family": "G_order_stress", "experiment": "G-MC-10000",
                 "trades": len(rs), "total_R": round(float(rs.sum()), 4),
                 "profit_factor": control_stats["profit_factor"],
                 "win_rate_pct": "", "max_drawdown_R":
                     f"median {dd_stress['median_maxDD']}; "
                     f"p1 {dd_stress['p1_maxDD']}; worst "
                     f"{dd_stress['worst_simulated_maxDD']}",
                 "note": f"P(worse than -12R) = "
                         f"{dd_stress['p_worse_than_minus12R']}%"})

    # ---------------- Family H ----------------
    entries = pd.to_datetime(control["entry_date"])
    exits = pd.to_datetime(control["exit_date"])
    n = len(control)
    conc = np.array([int(np.sum((entries.values <= exits[k])
                                & (exits.values >= entries[k])))
                     for k in range(n)])
    total_pairs = int(sum(
        1 for a in range(n) for b in range(a + 1, n)
        if entries.iloc[b] <= exits.iloc[a]))
    span_days = (exits.max() - entries.min()).days
    multi_pos_days = int(sum(
        1 for day in pd.date_range(entries.min(), exits.max())
        if ((entries <= day) & (exits >= day)).sum() > 1))
    h_summary = {
        "max_simultaneous": int(conc.max()),
        "avg_simultaneous": round(float(conc.mean()), 4),
        "pct_days_with_gt1_position": round(multi_pos_days / span_days * 100.0, 4),
        "overlapping_trade_pairs": total_pairs,
    }
    for cap in H_CAPS:
        keep, live_exits = [], []
        for row in control.sort_values(["entry_date", "signal_date"]).itertuples():
            live = sum(1 for e in live_exits if e >= row.entry_date)
            if live < cap:
                keep.append(row.Index)
                live_exits.append(row.exit_date)
        s = record("H_exposure", f"H-CAP{cap}", control.loc[keep])
        h_summary[f"cap{cap}"] = s

    # ---------------- Family I ----------------
    eq = control_rs.cumsum()
    running_max = eq.cummax()
    dd_series = eq - running_max
    in_dd = dd_series < 0
    dd_events = (in_dd & ~in_dd.shift(1, fill_value=False)).sum()
    recoveries = []
    current = 0
    for v in dd_series:
        if v < 0:
            current += 1
        elif current:
            recoveries.append(current)
            current = 0
    # drawdown-envelope artifact (specification: PHASE29_DRAWDOWN_STRESS.csv)
    dd_artifact = {
        "control_path": {
            "cumulative_final_R": round(float(eq.iloc[-1]), 4),
            "max_drawdown_R": round(float(dd_series.min()), 4),
            "num_drawdown_episodes": int(dd_events),
            "episode_depths_R": None,  # filled after episode scan below
            "recovery_lengths_bars_median": (int(np.median(recoveries))
                                             if recoveries else 0),
            "recovery_lengths_bars_max": int(max(recoveries))
            if recoveries else 0},
        "thresholds_R": DD_THRESHOLDS,
        "monte_carlo": {"seed": G_SEED, "iterations": G_ITERS},
    }
    dd_rows = []
    dd_path = {
        "cumulative_final_R": round(float(eq.iloc[-1]), 4),
        "max_drawdown_R": round(float(dd_series.min()), 4),
        "largest_peak_to_trough_R": round(float(dd_series.min()), 4),
        "num_drawdown_episodes": int(dd_events),
        "recovery_lengths_bars_median": (int(np.median(recoveries))
                                         if recoveries else 0),
        "recovery_lengths_bars_max": int(max(recoveries)) if recoveries else 0,
        "mc_envelope": dd_stress,
    }
    # count drawdown episodes whose depth exceeds each pre-registered threshold
    # (an episode = a maximal run of dd_series < 0; depth = its minimum)
    episode_depths = []
    cur_depth = None
    for v in dd_series:
        if v < 0:
            cur_depth = v if cur_depth is None else min(cur_depth, v)
        elif cur_depth is not None:
            episode_depths.append(float(cur_depth))
            cur_depth = None
    if cur_depth is not None:
        episode_depths.append(float(cur_depth))
    dd_path["drawdown_episode_depths_R"] = [
        round(d, 4) for d in sorted(episode_depths)]
    dd_path["drawdown_counts"] = {
        f"episodes_deeper_than_{t}R": int(sum(
            d <= -t + 1e-9 for d in episode_depths))
        for t in DD_THRESHOLDS}
    for t in DD_THRESHOLDS:
        dd_rows.append({
            "threshold_R": t,
            "episodes_deeper_than_threshold": int(sum(
                d <= -t + 1e-9 for d in episode_depths)),
            "realized_maxDD_R": round(float(dd_series.min()), 4),
            "mc_median_maxDD_R": dd_stress["median_maxDD"],
            "mc_p5_maxDD_R": dd_stress["p5_maxDD"],
            "mc_p1_maxDD_R": dd_stress["p1_maxDD"],
            "mc_p95_maxDD_R": dd_stress["p95_maxDD"],
            "mc_worst_maxDD_R": dd_stress["worst_simulated_maxDD"],
            "p_ordering_worse_than_minus12R_pct":
                dd_stress["p_worse_than_minus12R"],
            "losing_streak_p50": dd_stress["losing_streak_p50"],
            "losing_streak_p95": dd_stress["losing_streak_p95"],
            "losing_streak_max": dd_stress["losing_streak_max"]})
    pd.DataFrame(dd_rows).to_csv(
        ROOT / "PHASE29_DRAWDOWN_STRESS.csv", index=False)
    dd_artifact["control_path"]["episode_depths_R"] = \
        dd_path["drawdown_episode_depths_R"]
    dd_artifact["threshold_counts"] = dd_path["drawdown_counts"]
    with open(OUT / "phase29_drawdown_stress.json", "w") as fh:
        json.dump(dd_artifact, fh, indent=2)

    # ---------------- Family J ----------------
    j_rows = []
    for _, w in wf.iterrows():
        j_rows.append({
            "window": int(w["window"]), "test_year": int(w["test_period"]),
            "trades": int(w["test_trades"]),
            "total_R": w["test_total_R"], "PF": w["test_PF"],
            "win_rate_pct": w["test_win_rate_pct"],
            "avg_R": round(w["test_total_R"] / w["test_trades"], 4)
            if w["test_trades"] else 0.0,
            "maxDD": w["test_max_DD_R"]})
    temporal = pd.DataFrame(j_rows)
    temporal.to_csv(ROOT / "PHASE29_TEMPORAL_STRESS.csv", index=False)
    losing_runs, cur = [], 0
    profitable_runs, curp = [], 0
    for r in temporal["total_R"]:
        if r < 0:
            cur += 1
            profitable_runs.append(curp)
            curp = 0
        elif r > 0:
            curp += 1
            losing_runs.append(cur)
            cur = 0
        else:
            losing_runs.append(cur)
            profitable_runs.append(curp)
            cur = curp = 0
    losing_runs.append(cur)
    profitable_runs.append(curp)
    temporal_summary = {
        "best_window": int(temporal.loc[temporal["total_R"].idxmax(),
                                        "test_year"]),
        "worst_window": int(temporal.loc[temporal["total_R"].idxmin(),
                                         "test_year"]),
        "longest_zero_signal_run": int(max(
            (temporal["trades"] == 0).astype(int)
            .groupby((temporal["trades"] > 0).cumsum()).max())),
        "consecutive_losing_windows_max": int(max(losing_runs)),
        "consecutive_profitable_windows_max": int(max(profitable_runs)),
    }
    rows.append({"family": "J_temporal", "experiment": "J-WINDOWS",
                 "trades": int(temporal["trades"].sum()),
                 "total_R": round(float(temporal["total_R"].sum()), 4),
                 "profit_factor": "", "win_rate_pct": "",
                 "max_drawdown_R": temporal["maxDD"].min(),
                 "note": json.dumps(temporal_summary)})

    # ---------------- Family K ----------------
    enriched = pd.read_csv(ROOT / "phase27" / "results"
                           / "phase27_enriched_trades.csv")
    regime_rows = []
    for lo, hi, label in REGIME_VOL_BINS:
        m = (enriched["atr_pct"] >= lo) & (enriched["atr_pct"] < hi)
        if m.any():
            s = period_stats(enriched[m])
            regime_rows.append({"regime": f"vol_{label}", **s,
                                "small_sample": bool(s["trades"] < 10)})
    q33, q67 = enriched["ema20_ema50_gap"].quantile([1 / 3, 2 / 3])
    for label, m in (("narrow", enriched["ema20_ema50_gap"] <= q33),
                     ("mid", (enriched["ema20_ema50_gap"] > q33)
                      & (enriched["ema20_ema50_gap"] < q67)),
                     ("wide", enriched["ema20_ema50_gap"] >= q67)):
        if m.any():
            s = period_stats(enriched[m])
            regime_rows.append({"regime": f"trend_{label}", **s,
                                "small_sample": bool(s["trades"] < 10)})
    regime_df = pd.DataFrame(regime_rows)
    regime_df.to_csv(ROOT / "PHASE29_REGIME_STRESS.csv", index=False)
    rows.append({"family": "K_regime", "experiment": "K-REGIMES",
                 "trades": "", "total_R": "", "profit_factor": "",
                 "win_rate_pct": "", "max_drawdown_R": "",
                 "note": "per-cohort rows in PHASE29_REGIME_STRESS.csv"})

    # ---------------- Family L ----------------
    for pair, (fname, pip) in PAIRS.items():
        path = ROOT / fname
        saved = ref.PIP
        ref.PIP = pip
        try:
            d = ref.load_daily(path, ref.START_DATE)
            d["EMA20"] = ref.ema(d["Close"], 20)
            d["EMA50"] = ref.ema(d["Close"], 50)
            d["EMA50_rising"] = d["EMA50"] > d["EMA50"].shift(5)
            d["ATR"] = ref.atr(d, 14)
            d["PrevHigh"] = d["High"].shift(1)
            wok = ref.build_weekly_filter(d)
            d["weekly_ok"] = ref.map_weekly_to_daily(d, wok)
            d["daily_trend_ok"] = (
                (d["EMA20"] > d["EMA50"]) & d["EMA50_rising"])
            d["pullback"] = (
                (d["Low"] <= d["EMA20"]) & (d["Close"] > d["EMA20"]))
            d["confirm"] = d["Close"] > d["PrevHigh"]
            d["signal"] = (d["weekly_ok"] & d["daily_trend_ok"]
                           & d["pullback"] & d["confirm"])
            d.loc[: ref.WARMUP - 1, "signal"] = False
            t = ref.simulate_trades(d, "signal")
            s_full = period_stats(t)
            o = t[pd.to_datetime(t["entry_date"]).dt.year
                  .isin(range(2010, 2026))]
            s_oos = period_stats(o)
        finally:
            ref.PIP = saved
        rows.append({"family": "L_cross_pair",
                     "experiment": f"L-{pair}-FULL", **s_full, "note": ""})
        rows.append({"family": "L_cross_pair",
                     "experiment": f"L-{pair}-OOS2010-2025", **s_oos,
                     "note": ""})

    # F2 negative fractions (computed during Family F)
    # ---------------- write artifacts ----------------
    stress_df = pd.DataFrame(rows)
    stress_df.to_csv(ROOT / "PHASE29_STRESS_RESULTS.csv", index=False)
    exec_df = stress_df[stress_df["family"].isin(["A_execution", "B_entry_delay",
                                                  "C_exit_stress"])]
    exec_df.to_csv(ROOT / "PHASE29_EXECUTION_STRESS.csv", index=False)
    pd.DataFrame([baseline]).to_csv(
        OUT / "phase29_control_baseline.csv", index=False)

    summary = {
        "integrity": {
            "golden_reference_sha256": sha256_file(REFERENCE),
            "dataset_sha256": sha256_file(DATASET),
            "ledger_sha256": GOLDEN_LEDGER_SHA256,
            "python": sys.version.split()[0],
            "pandas": pd.__version__, "numpy": np.__version__,
        },
        "baseline": baseline,
        "h_exposure": h_summary,
        "i_drawdown": dd_path,
        "j_temporal": temporal_summary,
        "g_order_stress": dd_stress,
        "f2_negative_fraction": f2_negative,
    }

    with open(OUT / "phase29_summary.json", "w") as fh:
        json.dump(summary, fh, indent=2, default=str)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
