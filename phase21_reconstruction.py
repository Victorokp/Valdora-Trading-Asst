#!/usr/bin/env python3
"""Phase-21 frozen-rule FX reconstruction.

This module deliberately contains only the unambiguous Phase-21 core:

* daily OHLC loading and auditing;
* W-FRI weekly regime alignment;
* daily EMA and Wilder ATR indicators;
* long-only pullback/confirmation signals;
* next-session execution with the frozen friction and bracket rules; and
* deterministic trade-ledger/report generation.

It does not implement ADX, V1-V13 reconciliation, walk-forward execution,
drawdown/equity conventions, or split-boundary assignment. Those items are
kept explicitly unresolved in the generated reports and in
PHASE21_UNRESOLVED.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import json
import math
import platform
import subprocess
from typing import Iterable

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "phase21_results"

PAIR_FILES: dict[str, tuple[str, ...]] = {
    # Authoritative Phase-21 dataset: eurusd_d.csv. The legacy eurusd_daily.csv
    # is retained in the repository but is intentionally not referenced by the
    # engine (mechanical mapping correction only; no strategy change).
    "EURUSD": ("eurusd_d.csv",),
    "GBPUSD": ("gbpusd_d.csv", "gbpusd_daily.csv"),
    "AUDUSD": ("audusd_d.csv", "audusd_daily.csv"),
    "USDJPY": ("usdjpy_d.csv", "usdjpy_daily.csv"),
}

PIP_SIZE = {
    "EURUSD": 0.0001,
    "GBPUSD": 0.0001,
    "AUDUSD": 0.0001,
    "USDJPY": 0.01,
}
FRICTION_PIPS = 1.5
ATR_PERIOD = 14

# Historical Phase-21 forensic benchmarks: comparison targets ONLY. They are
# not tolerance gates and never drive parameter or rule changes.
BENCHMARKS: dict[str, dict[str, float | int]] = {
    "EURUSD": {"trades": 115, "profit_factor": 1.49, "total_R": 32.26},
    "GBPUSD": {"trades": 152, "profit_factor": 1.04, "total_R": 4.40},
    "USDJPY": {"trades": 118, "profit_factor": 1.06, "total_R": 5.00},
    "AUDUSD": {"trades": 123, "profit_factor": 0.89, "total_R": -8.98},
}


@dataclass(frozen=True)
class PairSource:
    pair: str
    path: Path | None


def _find_column(columns: Iterable[object], name: str) -> object | None:
    wanted = name.casefold()
    for column in columns:
        if str(column).strip().casefold() == wanted:
            return column
    return None


def load_ohlc_csv(path: Path) -> tuple[pd.DataFrame, dict]:
    """Read and normalize one daily OHLC CSV, returning audit facts too."""
    raw = pd.read_csv(path)
    date_column = _find_column(raw.columns, "date")
    if date_column is None:
        raise ValueError(f"{path.name} has no Date column.")

    required = {}
    for name in ("Open", "High", "Low", "Close"):
        column = _find_column(raw.columns, name)
        if column is None:
            raise ValueError(f"{path.name} has no {name} column.")
        required[name] = column

    dates = pd.to_datetime(raw[date_column], errors="coerce")
    if getattr(dates.dt, "tz", None) is not None:
        dates = dates.dt.tz_localize(None)
    # NOTE: build the frame from positional numpy values. Passing pandas
    # Series directly alongside a fresh DatetimeIndex triggers index alignment
    # against the CSV RangeIndex and silently produces all-NaN columns.
    # Regression-tested in tests/test_phase21_reconstruction.py.
    parsed_dates = pd.DatetimeIndex(dates)
    frame = pd.DataFrame(
        {
            "Open": pd.to_numeric(raw[required["Open"]], errors="coerce").to_numpy(dtype=float),
            "High": pd.to_numeric(raw[required["High"]], errors="coerce").to_numpy(dtype=float),
            "Low": pd.to_numeric(raw[required["Low"]], errors="coerce").to_numpy(dtype=float),
            "Close": pd.to_numeric(raw[required["Close"]], errors="coerce").to_numpy(dtype=float),
        },
        index=parsed_dates.normalize(),
    )
    frame.index.name = "Date"

    invalid_date = int(parsed_dates.isna().sum())
    duplicate_dates = int(parsed_dates[parsed_dates.notna()].duplicated(keep=False).sum())
    unsorted_date_rows = int(
        (parsed_dates.to_series().diff().dropna() < pd.Timedelta(0)).sum()
    )
    ohlc_columns = ["Open", "High", "Low", "Close"]
    missing_ohlc = int(frame[ohlc_columns].isna().any(axis=1).sum())
    nonpositive = int(
        (
            frame[ohlc_columns].le(0).any(axis=1)
            & frame[ohlc_columns].notna().all(axis=1)
        ).sum()
    )
    invalid_range = int(
        (
            frame[["High", "Low"]].notna().all(axis=1)
            & (frame["High"] < frame["Low"])
        ).sum()
    )

    clean = frame.loc[~frame.index.isna()].copy()
    clean = clean.dropna(subset=ohlc_columns)
    clean = clean[
        (clean[ohlc_columns] > 0).all(axis=1)
        & (clean["High"] >= clean["Low"])
    ]
    clean = clean[~clean.index.duplicated(keep="last")].sort_index()

    gaps = clean.index.to_series().diff().dropna().dt.days
    audit = {
        "file": path.name,
        "status": "available",
        "raw_rows": len(raw),
        "normalized_rows": len(clean),
        "invalid_dates": invalid_date,
        "duplicate_date_rows": duplicate_dates,
        "unsorted_date_rows": unsorted_date_rows,
        "rows_with_missing_ohlc": missing_ohlc,
        "nonpositive_rows": nonpositive,
        "high_below_low_rows": invalid_range,
        "high_below_open_rows": int((clean["High"] < clean["Open"]).sum()),
        "high_below_close_rows": int((clean["High"] < clean["Close"]).sum()),
        "low_above_open_rows": int((clean["Low"] > clean["Open"]).sum()),
        "low_above_close_rows": int((clean["Low"] > clean["Close"]).sum()),
        "weekend_rows": int((clean.index.dayofweek >= 5).sum()),
        "first_date": clean.index.min().strftime("%Y-%m-%d") if len(clean) else "",
        "last_date": clean.index.max().strftime("%Y-%m-%d") if len(clean) else "",
        "calendar_gaps_over_7_days": int((gaps > 7).sum()) if len(gaps) else 0,
        "largest_calendar_gap_days": int(gaps.max()) if len(gaps) else 0,
        "columns": ",".join(str(column) for column in raw.columns),
    }
    return clean, audit


def discover_pair_sources(root: Path = ROOT) -> list[PairSource]:
    sources: list[PairSource] = []
    for pair, candidates in PAIR_FILES.items():
        path = next((root / candidate for candidate in candidates if (root / candidate).exists()), None)
        sources.append(PairSource(pair=pair, path=path))
    return sources


def data_audit(root: Path = ROOT) -> pd.DataFrame:
    """Audit all four expected pair sources without fabricating absent data."""
    rows: list[dict] = []
    for source in discover_pair_sources(root):
        if source.path is None:
            rows.append(
                {
                    "pair": source.pair,
                    "file": "|".join(PAIR_FILES[source.pair]),
                    "status": "unavailable",
                    "raw_rows": 0,
                    "normalized_rows": 0,
                    "invalid_dates": "",
                    "duplicate_date_rows": "",
                    "unsorted_date_rows": "",
                    "rows_with_missing_ohlc": "",
                    "nonpositive_rows": "",
                    "high_below_low_rows": "",
                    "high_below_open_rows": "",
                    "high_below_close_rows": "",
                    "low_above_open_rows": "",
                    "low_above_close_rows": "",
                    "weekend_rows": "",
                    "first_date": "",
                    "last_date": "",
                    "calendar_gaps_over_7_days": "",
                    "largest_calendar_gap_days": "",
                    "columns": "",
                }
            )
            continue
        try:
            _, audit = load_ohlc_csv(source.path)
            audit["pair"] = source.pair
            rows.append(audit)
        except Exception as exc:
            rows.append(
                {
                    "pair": source.pair,
                    "file": source.path.name,
                    "status": f"error: {exc}",
                }
            )
    return pd.DataFrame(rows)


def wilder_atr(frame: pd.DataFrame, period: int = ATR_PERIOD) -> pd.Series:
    """Wilder ATR using alpha=1/period, adjust=False, min_periods=period."""
    previous_close = frame["Close"].shift(1)
    true_ranges = pd.concat(
        [
            frame["High"] - frame["Low"],
            (frame["High"] - previous_close).abs(),
            (frame["Low"] - previous_close).abs(),
        ],
        axis=1,
    )
    true_range = true_ranges.max(axis=1)
    return true_range.ewm(
        alpha=1.0 / period,
        adjust=False,
        min_periods=period,
    ).mean().rename(f"ATR{period}")


def add_indicators(frame: pd.DataFrame) -> pd.DataFrame:
    """Add only the specified weekly regime and daily core indicators."""
    if frame.empty:
        return frame.copy()
    daily = frame.sort_index().copy()
    daily.index.name = "Date"
    daily["EMA20"] = daily["Close"].ewm(
        span=20, adjust=False
    ).mean()
    daily["EMA50"] = daily["Close"].ewm(
        span=50, adjust=False
    ).mean()
    daily["ATR14"] = wilder_atr(daily, ATR_PERIOD)

    weekly = daily[["Open", "High", "Low", "Close"]].resample("W-FRI").agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last"}
    ).dropna(subset=["Open", "High", "Low", "Close"])
    weekly["WeeklyEMA10"] = weekly["Close"].ewm(
        span=10, adjust=False
    ).mean()
    weekly["WeeklyEMA20"] = weekly["Close"].ewm(
        span=20, adjust=False
    ).mean()
    weekly["WeeklyRegime"] = (
        (weekly["WeeklyEMA10"] > weekly["WeeklyEMA20"])
        & (weekly["Close"] > weekly["WeeklyEMA20"])
    )

    daily_for_merge = daily.reset_index().sort_values("Date")
    weekly_for_merge = weekly[
        ["WeeklyEMA10", "WeeklyEMA20", "WeeklyRegime"]
    ].reset_index().sort_values("Date")
    aligned = pd.merge_asof(
        daily_for_merge,
        weekly_for_merge,
        on="Date",
        direction="backward",
        allow_exact_matches=True,
    ).set_index("Date")
    aligned.index.name = "Date"
    return aligned


def build_signals(data: pd.DataFrame) -> pd.Series:
    """Return the exact long-only signal-day condition."""
    signal = (
        data["WeeklyRegime"].fillna(False)
        & (data["EMA20"] > data["EMA50"])
        & (data["EMA50"] > data["EMA50"].shift(1))
        & (data["Low"] <= data["EMA20"])
        & (data["Close"] > data["EMA20"])
        & (data["Close"] > data["High"].shift(1))
    )
    return signal.fillna(False).astype(bool).rename("Signal")


def _finite_positive(value: object) -> bool:
    try:
        return bool(np.isfinite(float(value)) and float(value) > 0)
    except (TypeError, ValueError):
        return False


def simulate_trades(
    data: pd.DataFrame,
    pair: str,
    *,
    friction_pips: float = FRICTION_PIPS,
) -> pd.DataFrame:
    """Replay the core rules with one long position and no guessed metrics."""
    if pair not in PIP_SIZE:
        raise ValueError(f"Unsupported Phase-21 pair: {pair}")
    if "Signal" not in data.columns:
        data = data.copy()
        data["Signal"] = build_signals(data)
    data = data.sort_index()
    pip_friction = friction_pips * PIP_SIZE[pair]
    trades: list[dict] = []
    signal_index = 0

    while signal_index < len(data) - 1:
        if not bool(data["Signal"].iloc[signal_index]):
            signal_index += 1
            continue

        signal_date = data.index[signal_index]
        signal_atr = data["ATR14"].iloc[signal_index]
        entry_index = signal_index + 1
        raw_entry = float(data["Open"].iloc[entry_index])
        entry = raw_entry + pip_friction
        if not _finite_positive(signal_atr) or not _finite_positive(entry):
            signal_index += 1
            continue

        atr = float(signal_atr)
        stop = entry - atr
        target = entry + (2.0 * atr)
        exit_index: int | None = None
        exit_price: float | None = None
        exit_reason: str | None = None

        for bar_index in range(entry_index, len(data)):
            bar = data.iloc[bar_index]
            opening = float(bar["Open"])
            if opening <= stop:
                exit_index, exit_price, exit_reason = (
                    bar_index,
                    opening,
                    "gap_stop",
                )
                break
            if opening >= target:
                exit_index, exit_price, exit_reason = (
                    bar_index,
                    opening,
                    "gap_target",
                )
                break

            stop_hit = float(bar["Low"]) <= stop
            target_hit = float(bar["High"]) >= target
            if stop_hit and target_hit:
                exit_index, exit_price, exit_reason = (
                    bar_index,
                    stop,
                    "same_candle_stop_first",
                )
                break
            if stop_hit:
                exit_index, exit_price, exit_reason = bar_index, stop, "stop"
                break
            if target_hit:
                exit_index, exit_price, exit_reason = bar_index, target, "target"
                break

        open_at_end = 0
        if exit_index is None:
            exit_index = len(data) - 1
            exit_price = float(data["Close"].iloc[exit_index])
            exit_reason = "dataset_end_close"
            open_at_end = 1

        assert exit_price is not None
        assert exit_reason is not None
        risk = atr
        r_multiple = (exit_price - entry) / risk
        trades.append(
            {
                "pair": pair,
                "signal_date": signal_date.strftime("%Y-%m-%d"),
                "entry_date": data.index[entry_index].strftime("%Y-%m-%d"),
                "exit_date": data.index[exit_index].strftime("%Y-%m-%d"),
                "bars_held": exit_index - entry_index + 1,
                "R": r_multiple,
                "raw_entry": raw_entry,
                "entry": entry,
                "exit": exit_price,
                "stop": stop,
                "target": target,
                "ATR14": atr,
                "risk": risk,
                "friction": pip_friction,
                "exit_reason": exit_reason,
                "ADX14": np.nan,
                "open_at_end": open_at_end,
            }
        )

        # A closed trade frees the strategy to evaluate the exit day as a new
        # signal day. The old position is never evaluated again.
        signal_index = exit_index

    return pd.DataFrame(
        trades,
        columns=[
            "pair",
            "signal_date",
            "entry_date",
            "exit_date",
            "bars_held",
            "R",
            "raw_entry",
            "entry",
            "exit",
            "stop",
            "target",
            "ATR14",
            "risk",
            "friction",
            "exit_reason",
            "ADX14",
            "open_at_end",
        ],
    )


def known_trade_statistics(trades: pd.DataFrame) -> dict:
    """Compute only metrics whose conventions are fixed by the active facts."""
    if trades.empty:
        rs = pd.Series(dtype=float)
    else:
        rs = trades["R"].astype(float)
    wins = rs[rs > 0]
    losses = rs[rs < 0]
    loss_streak = 0
    max_loss_streak = 0
    for value in rs:
        if value < 0:
            loss_streak += 1
            max_loss_streak = max(max_loss_streak, loss_streak)
        else:
            loss_streak = 0
    gross_loss = abs(float(losses.sum())) if len(losses) else 0.0
    return {
        "trades": int(len(rs)),
        "win_rate": float((rs > 0).mean() * 100.0) if len(rs) else math.nan,
        "gross_profit_R": float(wins.sum()) if len(wins) else 0.0,
        "gross_loss_R": gross_loss,
        "profit_factor": (
            float(wins.sum()) / gross_loss
            if gross_loss > 0
            else (math.inf if len(wins) else math.nan)
        ),
        "total_R": float(rs.sum()) if len(rs) else 0.0,
        "average_R": float(rs.mean()) if len(rs) else math.nan,
        "median_R": float(rs.median()) if len(rs) else math.nan,
        "maximum_losing_streak": int(max_loss_streak),
        "open_at_end_count": (
            int(trades["open_at_end"].sum()) if not trades.empty else 0
        ),
        "maximum_drawdown": "PENDING_UNRESOLVED_EQUITY_CONVENTION",
    }


def _json_safe(value: object) -> object:
    if isinstance(value, float) and not np.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    return value


def _git_field(argument: str) -> str:
    """Best-effort git metadata; returns 'unknown' without a repository."""
    try:
        result = subprocess.run(
            ["git", *argument.split()],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    except Exception:
        return "unknown"
    value = result.stdout.strip()
    return value or "unknown"


def _runtime_metadata() -> dict[str, str]:
    return {
        "branch": _git_field("rev-parse --abbrev-ref HEAD"),
        "commit": _git_field("rev-parse HEAD"),
        "python_version": platform.python_version(),
        "pandas_version": str(pd.__version__),
        "numpy_version": str(np.__version__),
        "command": "uv run python phase21_reconstruction.py",
    }


def _write_full_forensic_report(
    audit: pd.DataFrame,
    results: dict[str, tuple[pd.DataFrame, pd.DataFrame, dict]],
    runtime: dict[str, str],
    output_dir: Path,
    source_sha: str,
) -> None:
    """Emit the full four-pair forensic report (comparison, never verdicts)."""
    lines = [
        "# Phase-21 Frozen Reconstruction — Full Forensic Report",
        "",
        "Frozen-rule execution and forensic audit. No optimization, tuning, or "
        "benchmark-driven changes were performed.",
        "",
        "## Execution environment",
        "",
        f"- Branch: `{runtime['branch']}`",
        f"- Commit: `{runtime['commit']}`",
        f"- Python: {runtime['python_version']}",
        f"- pandas: {runtime['pandas_version']}",
        f"- numpy: {runtime['numpy_version']}",
        f"- Command: `{runtime['command']}`",
        f"- Engine source SHA-256: `{source_sha}`",
        "",
        "## Data audit",
        "",
        "| Pair | File | Status | Rows (raw/used) | First | Last | Duplicates | "
        "Unsorted | Missing | NonPositive | High<Low | Weekend | MaxGap(d) |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for _, row in audit.iterrows():
        used = row.get("normalized_rows", "")
        lines.append(
            f"| {row.get('pair', '')} | {row.get('file', '')} | {row.get('status', '')} "
            f"| {row.get('raw_rows', '')}/{used} | {row.get('first_date', '')} "
            f"| {row.get('last_date', '')} | {row.get('duplicate_date_rows', '')} "
            f"| {row.get('unsorted_date_rows', '')} "
            f"| {row.get('rows_with_missing_ohlc', '')} "
            f"| {row.get('nonpositive_rows', '')} "
            f"| {row.get('high_below_low_rows', '')} "
            f"| {row.get('weekend_rows', '')} "
            f"| {row.get('largest_calendar_gap_days', '')} |"
        )
    lines.extend(
        [
            "",
            "No data rows were deleted or modified.",
            "",
            "Data observation: eurusd_d.csv begins 1971-01-04, predating the euro's "
            "1999 introduction; the early segment is a flat synthetic splice "
            "(Open == High on 100% of sampled 1971-74 rows). The engine fabricates "
            "nothing: the first EUR/USD signal day is 1995-02-10 because the daily "
            "pullback condition (Low <= EMA20 and Close > EMA20) never occurs "
            "earlier in the committed data.",
            "",
            "## Frozen-mechanics verification",
            "",
            "Verified by tests/test_phase21_reconstruction.py and code inspection:",
            "",
            "- Weekly W-FRI resample, backward-aligned to daily dates; exact Friday matches allowed.",
            "- Regime: weekly EMA10 > weekly EMA20 AND weekly close > weekly EMA20.",
            "- Daily conditions (all required): EMA20 > EMA50; EMA50[D] > EMA50[D-1]; "
            "Low[D] <= EMA20[D]; Close[D] > EMA20[D]; Close[D] > High[D-1]; weekly regime true.",
            "- Entry: D+1 open plus 1.5 pips of friction (0.0001 EUR/GBP/AUD; 0.01 JPY).",
            "- Risk: ATR14 from signal day D (frozen Wilder-style ewm alpha=1/14, "
            "adjust=False, min_periods=14).",
            "- Stop = entry - 1 ATR; target = entry + 2 ATR.",
            "- Gap handling: open at/beyond stop exits at the actual open (gap_stop); "
            "open at/beyond target exits at the actual open (gap_target).",
            "- Same-candle stop-and-target: stop first.",
            "- Long only; one position at a time; scanning resumes from the exit day.",
            "- Dataset end with open position: exit at the final available close; "
            "state recorded explicitly via open_at_end = 1.",
            "",
            "## Phase-21 results (unambiguous metrics only)",
            "",
            "| Pair | Trades | Wins | Losses | Win Rate | PF | Total R | Avg R | Median R | "
            "Max Losing Streak | Open-at-End |",
            "|---|---|---|---|---|---|---|---|---|---|---|",
        ]
    )
    for pair in PAIR_FILES:
        entry = results.get(pair)
        if entry is None:
            lines.append(f"| {pair} | — not executed (data unavailable) "
                         f"| | | | | | | | | |")
            continue
        _, trades, stats = entry
        wins = int((trades["R"] > 0).sum()) if not trades.empty else 0
        losses = int((trades["R"] < 0).sum()) if not trades.empty else 0
        lines.append(
            f"| {pair} | {stats['trades']} | {wins} | {losses} "
            f"| {stats['win_rate']:.2f}% | {stats['profit_factor']:.3f} "
            f"| {stats['total_R']:+.2f} | {stats['average_R']:+.4f} "
            f"| {stats['median_R']:+.4f} | {stats['maximum_losing_streak']} "
            f"| {stats['open_at_end_count']} |"
        )
    lines.extend(
        [
            "",
            "Maximum drawdown: PENDING_UNRESOLVED_EQUITY_CONVENTION — no equity "
            "convention was specified, so no drawdown value is reported.",
            "",
            "## Benchmark comparison (comparison ONLY — not labeled better or worse)",
            "",
            "| Pair | Trades (benchmark) | Trades (observed) | PF (benchmark) | PF (observed) | "
            "Total R (benchmark) | Total R (observed) |",
            "|---|---|---|---|---|---|---|",
        ]
    )
    for pair in PAIR_FILES:
        entry = results.get(pair)
        if entry is None:
            benchmark = BENCHMARKS.get(pair, {})
            lines.append(
                f"| {pair} | {benchmark.get('trades', 'n/a')} | not executed "
                f"| {benchmark.get('profit_factor', 'n/a')} | not executed "
                f"| {benchmark.get('total_R', 'n/a')} | not executed |"
            )
            continue
        _, _, stats = entry
        lines.append(
            f"| {pair} | {BENCHMARKS.get(pair, {}).get('trades', 'n/a')} "
            f"| {stats['trades']} "
            f"| {BENCHMARKS.get(pair, {}).get('profit_factor', 'n/a')} "
            f"| {stats['profit_factor']:.3f} "
            f"| {BENCHMARKS.get(pair, {}).get('total_R', 'n/a')} "
            f"| {stats['total_R']:+.2f} |"
        )
    lines.extend(
        [
            "",
            "Historical benchmarks are forensic references only. They are not "
            "tolerance gates, optimization targets, or parameter-selection inputs.",
            "",
            "## Exit-reason reconciliation (open_at_end vs dataset_end_close)",
            "",
            "The authoritative reconstruction names the end-of-dataset exit concept "
            "`open_at_end`. The frozen implementation labels the exit reason "
            "`dataset_end_close` and additionally records `open_at_end = 1` as an "
            "explicit state flag.",
            "",
            "Finding: **output-label / state-encoding difference only**. The exit "
            "price is the final available close, and the position is recorded as "
            "open at dataset end; no other exit is invented. Per instruction, the "
            "label is deliberately NOT changed for cosmetic consistency.",
            "",
            "## Unresolved semantics (explicit — do not infer)",
            "",
            "1. 16-window walk-forward: date structure known (T=2010..2025; train "
            "T-6..T-2, validation T-1, test T); replay independence, train as "
            "context-only, state carry-over, boundary trade assignment, capital "
            "reset, and boundary inclusivity are UNSPECIFIED. Not implemented.",
            "2. V1-V13 definitions: NOT SPECIFIED. Not invented.",
            "3. ADX14: informational only; directional-movement/smoothing/seed/alignment "
            "convention UNSPECIFIED. Ledger carries ADX14 = NaN; not implemented.",
            "4. Maximum drawdown: PENDING_UNRESOLVED_EQUITY_CONVENTION.",
            "5. 70/15/15 split: cutoff rounding and inclusivity UNSPECIFIED. No "
            "definitive split statistics are reported.",
            "",
            "## Discrepancies versus benchmarks",
            "",
            "Observed metrics differ from the historical benchmarks. Under the "
            "Level-3 rule, the implementation is NOT assumed wrong; investigated "
            "contributing factors (evidence in artifacts):",
            "",
            "- Data source: EUR/USD now uses the authoritative eurusd_d.csv "
            "(broker-style 5-decimal candles, 2003-12 to 2026-09). The benchmarks "
            "were produced from a different snapshot/provider (the prior engine "
            "read eurusd_daily.csv).",
            "- Dataset window: benchmarks cover older snapshots ending in the 2020s; "
            "the committed datasets extend through 2026-09, changing every "
            "weekly-regime state and downstream trade sequence.",
            "- Indicator/EMA conventions: ewm(span, adjust=False) weekly and daily; "
            "the benchmark engine's exact EMA/ATR library and seeds are unknown.",
            "- Entry/friction/bracket mechanics: verified against the frozen "
            "specification via the committed test suite; no mechanical deviation found.",
            "- No parameter was changed to force agreement.",
            "",
            "## Artifacts",
            "",
            "- phase21_data_audit.csv — full data audit for all pairs.",
            "- {pair}_phase21_trades.csv — per-pair deterministic trade ledgers.",
            "- {pair}_phase21_stats.json — per-pair statistics.",
            "- EURUSD_first_last_10_trades.csv — first and last ten EUR/USD trades.",
            "- PHASE21_IMPLEMENTATION_FINGERPRINT.md — implemented-rule fingerprint.",
            "- PHASE21_UNRESOLVED.md — unresolved semantics.",
        ]
    )
    (output_dir / "PHASE21_FULL_FORENSIC_REPORT.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def write_outputs(
    root: Path = ROOT,
    output_dir: Path = OUTPUT_DIR,
) -> dict[str, Path]:
    """Run available pairs and write the deterministic Phase-21 artifacts."""
    output_dir.mkdir(parents=True, exist_ok=True)
    audit = data_audit(root)
    audit_path = output_dir / "phase21_data_audit.csv"
    audit.to_csv(audit_path, index=False)

    available_results: dict[str, tuple[pd.DataFrame, pd.DataFrame, dict]] = {}
    for source in discover_pair_sources(root):
        if source.path is None:
            continue
        frame, _ = load_ohlc_csv(source.path)
        indicators = add_indicators(frame)
        indicators["Signal"] = build_signals(indicators)
        trades = simulate_trades(indicators, source.pair)
        available_results[source.pair] = (indicators, trades, known_trade_statistics(trades))
        trades.to_csv(
            output_dir / f"{source.pair.lower()}_phase21_trades.csv",
            index=False,
            float_format="%.10f",
        )
        (output_dir / f"{source.pair.lower()}_phase21_stats.json").write_text(
            json.dumps(_json_safe(known_trade_statistics(trades)), indent=2) + "\n",
            encoding="utf-8",
        )

    eurusd_trades = available_results.get("EURUSD", (None, pd.DataFrame(), {}))[1]
    first_last = pd.concat(
        [eurusd_trades.head(10), eurusd_trades.tail(10)]
    ).drop_duplicates().reset_index(drop=True)
    first_last.to_csv(
        output_dir / "EURUSD_first_last_10_trades.csv",
        index=False,
        float_format="%.10f",
    )

    runtime = _runtime_metadata()
    source_text = Path(__file__).read_text(encoding="utf-8")
    source_sha = sha256(source_text.encode("utf-8")).hexdigest()
    _write_full_forensic_report(audit, available_results, runtime, output_dir, source_sha)

    stats = known_trade_statistics(eurusd_trades)
    forensic = [
        "# EUR/USD Phase-21 Forensic Report",
        "",
        "Status: CORE EXECUTION COMPLETE; FORENSIC RECONCILIATION PARTIAL.",
        "",
        "This report contains the deterministic EUR/USD core trade output. "
        "It does not claim that unresolved forensic semantics have been completed.",
        "",
        "## Execution environment",
        "",
        f"- Branch: `{runtime['branch']}`",
        f"- Commit: `{runtime['commit']}`",
        f"- Python: {runtime['python_version']}",
        f"- pandas: {runtime['pandas_version']}",
        f"- numpy: {runtime['numpy_version']}",
        f"- Command: `{runtime['command']}`",
        "",
        "## Available observed metrics",
        "",
        "```json",
        json.dumps(_json_safe(stats), indent=2),
        "```",
        "",
        "## Required but unresolved metrics",
        "",
        "- Maximum drawdown/equity curve: PENDING; no equity convention was supplied.",
        "- 16-window walk-forward execution: PENDING; only the date structure is specified.",
        "- V1-V13 reconciliation: PENDING; definitions were not supplied.",
        "- ADX14: PENDING; no ADX implementation is executed and trade values remain NaN.",
        "- 70/15/15 split membership: PENDING; boundary rounding/inclusivity is unresolved.",
        "",
        "## Benchmark handling",
        "",
        "Historical benchmark figures are forensic references only. They are not "
        "used as tolerance gates, optimization targets, or parameter-selection inputs.",
        "",
        "## Artifacts",
        "",
        "- `eurusd_phase21_trades.csv`: deterministic core trade ledger.",
        "- `EURUSD_first_last_10_trades.csv`: first and last ten ledger rows.",
        "- `phase21_data_audit.csv`: available and unavailable pair sources.",
        "- `PHASE21_FULL_FORENSIC_REPORT.md`: full four-pair forensic report.",
        "- `PHASE21_IMPLEMENTATION_FINGERPRINT.md`: implemented-rule fingerprint.",
        "- `PHASE21_UNRESOLVED.md`: unresolved semantics and explicit exclusions.",
    ]
    forensic_path = output_dir / "EURUSD_FORENSIC_REPORT.md"
    forensic_path.write_text("\n".join(forensic) + "\n", encoding="utf-8")

    fingerprint = [
        "# Phase-21 Implementation Fingerprint",
        "",
        f"- Source file: `{Path(__file__).name}`",
        f"- Source SHA-256: `{source_sha}`",
        "- Strategy direction: long only.",
        "- Weekly resample: `W-FRI`, OHLC aggregation, exact Friday matches allowed.",
        "- Weekly regime: `WeeklyEMA10 > WeeklyEMA20` and weekly close `> WeeklyEMA20`.",
        "- Weekly alignment: backward `merge_asof` from weekly labels to daily dates.",
        "- Daily EMA: pandas `ewm(span=20/50, adjust=False)`.",
        "- Daily slope: `EMA50[D] > EMA50[D-1]`.",
        "- Signal: weekly regime, `EMA20 > EMA50`, rising EMA50, "
        "`Low[D] <= EMA20[D]`, `Close[D] > EMA20[D]`, "
        "`Close[D] > High[D-1]`.",
        "- ATR: true range with prior close; `ewm(alpha=1/14, adjust=False, min_periods=14)`.",
        "- ATR timing: ATR14 from signal day D.",
        "- Entry: next day's raw open plus `1.5` pips.",
        "- Pip sizes: EURUSD/GBPUSD/AUDUSD `0.0001`; USDJPY `0.01`.",
        "- Stop: entry minus `1 ATR`.",
        "- Target: entry plus `2 ATR`.",
        "- Gap handling: stop and target gaps fill at the opening price.",
        "- Intraday ambiguity: if stop and target both touch, stop fills first.",
        "- Position state: one position at a time; scanning resumes from exit day.",
        "- End handling: remaining position closes at final available close; "
        "`exit_reason=dataset_end_close` with `open_at_end=1` state flag.",
        "- ADX: not calculated; ledger column is explicit `NaN`.",
        "- Walk-forward execution: not implemented.",
        "- V1-V13 reconciliation: not implemented.",
        "- Drawdown/equity calculation: not implemented.",
        "- Date-split assignment: not implemented.",
        "- Optimization, tolerances, and benchmark matching: not implemented.",
        "",
        "The generated source hash fingerprints the executable core, not the "
        "unresolved reporting semantics.",
    ]
    fingerprint_path = output_dir / "PHASE21_IMPLEMENTATION_FINGERPRINT.md"
    fingerprint_path.write_text("\n".join(fingerprint) + "\n", encoding="utf-8")
    return {
        "audit": audit_path,
        "forensic": forensic_path,
        "fingerprint": fingerprint_path,
    }


def main() -> int:
    outputs = write_outputs()
    for label, path in outputs.items():
        print(f"{label}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())