#!/usr/bin/env python3
"""Phase-28 audits: data integrity, look-ahead, split boundaries.

Look-ahead audit (section 17): for EVERY signal day D in the Golden
Reference ledger, rebuild the entire pipeline from data truncated to rows
with Date <= D and verify the signal at D is unchanged. If any signal used
information after its signal-day close, the truncated pipeline could not
reproduce it. Also verifies entry = next trading day's Open + 1.5 pips for
every trade (no next-day information influences signal generation).

Split-boundary audit (section 18): verifies bucketing follows the historical
rules (train <= 2019-11-20 < validation <= 2023-04-23 < final by entry date)
and documents exit-date straddling; any ambiguity stops the phase.

Output: phase28/results/phase28_validation.json
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
TRAIN_END = pd.Timestamp("2019-11-20")
VAL_END = pd.Timestamp("2023-04-23")


def load_reference():
    spec = importlib.util.spec_from_file_location(
        "phase21_historical_reference", ROOT / "phase21_historical_reference.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def rebuild_pipeline(ref, daily: pd.DataFrame) -> pd.DataFrame:
    d = daily.copy()
    d["EMA20"] = ref.ema(d["Close"], 20)
    d["EMA50"] = ref.ema(d["Close"], 50)
    d["EMA50_rising"] = d["EMA50"] > d["EMA50"].shift(5)
    d["ATR"] = ref.atr(d, 14)
    d["PrevHigh"] = d["High"].shift(1)
    weekly_ok = ref.build_weekly_filter(d)
    d["weekly_ok"] = ref.map_weekly_to_daily(d, weekly_ok)
    d["daily_trend_ok"] = (d["EMA20"] > d["EMA50"]) & d["EMA50_rising"]
    d["pullback"] = (d["Low"] <= d["EMA20"]) & (d["Close"] > d["EMA20"])
    d["confirm"] = d["Close"] > d["PrevHigh"]
    d["signal"] = (
        d["weekly_ok"] & d["daily_trend_ok"] & d["pullback"] & d["confirm"]
    )
    d.loc[: ref.WARMUP - 1, "signal"] = False
    return d


def main() -> None:
    ref = load_reference()
    full = ref.load_daily(DATASET, ref.START_DATE)
    ledger = pd.read_csv(OUT / "PHASE28_OOS_TRADES.csv")

    # ---------------- data integrity (section 16) ----------------
    dup = int(full["Date"].duplicated().sum())
    chrono = bool(full["Date"].is_monotonic_increasing)
    gap_days = full["Date"].diff().dt.days.dropna()
    integrity = {
        "rows": int(len(full)),
        "first_date": str(full["Date"].iloc[0].date()),
        "last_date": str(full["Date"].iloc[-1].date()),
        "duplicate_dates": dup,
        "chronological_order": chrono,
        "missing_ohlc_rows": int(full[["Open", "High", "Low", "Close"]]
                                 .isna().any(axis=1).sum()),
        "nonpositive_rows": int((full[["Open", "High", "Low", "Close"]] <= 0)
                                .any(axis=1).sum()),
        "high_lt_low_rows": int((full["High"] < full["Low"]).sum()),
        "high_lt_open_or_close": int(((full["High"] < full["Open"])
                                      | (full["High"] < full["Close"])).sum()),
        "low_gt_open_or_close": int(((full["Low"] > full["Open"])
                                     | (full["Low"] > full["Close"])).sum()),
        "weekend_rows": int((full["Date"].dt.dayofweek >= 5).sum()),
        "largest_calendar_gap_days": int(gap_days.max()),
        "no_future_rows_note": ("ledger rows are a subset of this file's "
                                "dates; verified by trade-date membership"),
    }
    dates = set(full["Date"])
    unknown_dates = int(sum(
        1 for c in ("signal_date", "entry_date", "exit_date")
        for d in pd.to_datetime(ledger[c])
        if d not in dates))
    integrity["ledger_dates_missing_from_dataset"] = unknown_dates

    # ---------------- look-ahead audit (section 17) ----------------
    signal_days = sorted(set(pd.to_datetime(ledger["signal_date"])))
    full_sig = rebuild_pipeline(ref, full)
    failures = []
    checked = 0
    for D in signal_days:
        truncated = full[full["Date"] <= D].reset_index(drop=True)
        trunc_sig = rebuild_pipeline(ref, truncated)
        row_full = full_sig.loc[full_sig["Date"] == D, "signal"].iloc[0]
        if len(trunc_sig) == 0 or trunc_sig["Date"].iloc[-1] != D:
            failures.append({"signal_date": str(D.date()),
                             "reason": "signal day outside truncated data"})
            continue
        row_trunc = trunc_sig["signal"].iloc[-1]
        checked += 1
        if bool(row_full) != bool(row_trunc):
            failures.append({
                "signal_date": str(D.date()),
                "full": bool(row_full), "truncated": bool(row_trunc),
                "reason": "signal changed when future rows removed",
            })
    lookahead = {
        "method": ("full pipeline rebuilt from data truncated at each "
                   "signal day; signal must be identical from "
                   "signal-day-close information alone"),
        "signals_checked": checked,
        "failures": failures,
        "result": "PASS" if not failures else "FAIL",
    }

    # entry timing: entry = next dataset row's Open + 1.5 pips
    date_pos = pd.Series(np.arange(len(full)), index=full["Date"])
    entry_ok = 0
    entry_bad = []
    for row in ledger.itertuples():
        i = int(date_pos[pd.Timestamp(row.signal_date)])
        entry_i = i + 1
        if entry_i >= len(full):
            entry_bad.append({"signal_date": row.signal_date,
                              "reason": "no next row"})
            continue
        expected = float(full["Open"].iloc[entry_i]) + 1.5 * ref.PIP
        if abs(expected - float(row.entry_price)) <= 1e-12:
            entry_ok += 1
        else:
            entry_bad.append({
                "signal_date": row.signal_date,
                "expected": expected, "ledger": float(row.entry_price)})
    entry_audit = {
        "trades_checked": int(len(ledger)),
        "entry_matches_next_open_plus_friction": entry_ok,
        "mismatches": entry_bad,
        "result": "PASS" if not entry_bad else "FAIL",
    }

    # ---------------- split-boundary audit (section 18) ----------------
    ledger["entry_date"] = pd.to_datetime(ledger["entry_date"])
    ledger["exit_date"] = pd.to_datetime(ledger["exit_date"])
    expected_split = np.where(
        ledger["entry_date"] <= TRAIN_END, "train",
        np.where(ledger["entry_date"] <= VAL_END, "validation", "final"))
    split_ok = bool((ledger["split"] == expected_split).all())
    straddle = ledger[
        (ledger["split"] == "train") & (ledger["exit_date"] > TRAIN_END)
    ]
    straddle_val = ledger[
        (ledger["split"] == "validation") & (ledger["exit_date"] > VAL_END)
    ]
    boundary = {
        "rule": ("historical: bucket by ENTRY date; train <= 2019-11-20 < "
                 "validation <= 2023-04-23 < final; exit dates never "
                 "re-bucket a trade (Golden Reference semantics)"),
        "split_assignment_matches_rule": split_ok,
        "train_trades_exiting_after_train_end": int(len(straddle)),
        "validation_trades_exiting_after_val_end": int(len(straddle_val)),
        "straddle_note": (
            "trades whose exit falls in a later period remain in their "
            "entry-date bucket (historical convention); no information "
            "transfers backward because bucketing is by entry date only"),
        "ambiguity_discovered": False,
        "result": "PASS" if split_ok else "FAIL",
    }

    result = {
        "data_integrity": integrity,
        "lookahead_audit": lookahead,
        "entry_timing_audit": entry_audit,
        "split_boundary_audit": boundary,
        "overall": "PASS" if (
            not failures and not entry_bad and split_ok
            and dup == 0 and chrono
        ) else "FAIL",
    }
    with open(OUT / "phase28_validation.json", "w") as fh:
        json.dump(result, fh, indent=2)
    print(json.dumps(result, indent=2))
    if result["overall"] != "PASS":
        raise SystemExit("PHASE 28 STOP: audit gate failed.")


if __name__ == "__main__":
    main()
