#!/usr/bin/env python3
"""Transparent, information-only EUR/USD daily market-state assistant.

The raw Yahoo Finance OHLCV history is cached in eurusd_daily.csv. Indicators
are calculated at runtime and are not written into the raw-data cache.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
import sys

import numpy as np
import pandas as pd


TICKER = "EURUSD=X"
INTERVAL = "1d"
HISTORY_FILE = Path(__file__).with_name("eurusd_daily.csv")

EMA_FAST = 20
EMA_SLOW = 50
ATR_PERIOD = 14
RSI_PERIOD = 14
BREAKOUT_PERIOD = 20

# V1 volatility gate: ATR must be between 0.10% and 1.50% of closing price.
# These are explicit fixed thresholds, not optimized from the downloaded data.
MIN_ATR_PCT = 0.10
MAX_ATR_PCT = 1.50


def _normalise_history(history: pd.DataFrame) -> pd.DataFrame:
    """Keep raw OHLCV columns and normalize Yahoo's index to session dates."""
    if history is None or history.empty:
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

    # Ticker.history normally returns flat columns. Handle MultiIndex output too.
    if isinstance(history.columns, pd.MultiIndex):
        flattened = []
        for column in history.columns:
            parts = [str(part) for part in column if str(part) != TICKER]
            flattened.append(parts[0] if parts else str(column[0]))
        history = history.copy()
        history.columns = flattened

    column_lookup = {str(column).lower(): column for column in history.columns}
    required = ("open", "high", "low", "close")
    missing = [name for name in required if name not in column_lookup]
    if missing:
        raise ValueError(
            "Yahoo Finance response is missing OHLC columns: "
            + ", ".join(missing)
        )

    frame = pd.DataFrame(index=history.index)
    for name in ("Open", "High", "Low", "Close"):
        frame[name] = pd.to_numeric(
            history[column_lookup[name.lower()]], errors="coerce"
        )
    volume_column = column_lookup.get("volume")
    frame["Volume"] = (
        pd.to_numeric(history[volume_column], errors="coerce")
        if volume_column is not None
        else 0
    )

    dates = pd.to_datetime(frame.index, errors="coerce")
    if getattr(dates, "tz", None) is not None:
        dates = dates.tz_localize(None)
    frame.index = pd.DatetimeIndex(dates).normalize()
    frame.index.name = "Date"
    frame = frame[~frame.index.isna()]
    frame = frame.dropna(subset=["Open", "High", "Low", "Close"])
    frame = frame[
        (frame["Open"] > 0)
        & (frame["High"] > 0)
        & (frame["Low"] > 0)
        & (frame["Close"] > 0)
        & (frame["High"] >= frame["Low"])
    ]
    frame = frame[~frame.index.duplicated(keep="last")].sort_index()
    return frame[["Open", "High", "Low", "Close", "Volume"]]


def _download_history(start: date | None = None) -> pd.DataFrame:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise RuntimeError(
            "yfinance is not installed. Install the project's declared "
            "dependencies with `uv sync`."
        ) from exc

    options = {
        "interval": INTERVAL,
        "auto_adjust": False,
        "actions": False,
        "prepost": False,
    }
    if start is None:
        options["period"] = "max"
    else:
        options["start"] = start.isoformat()

    history = yf.Ticker(TICKER).history(**options)
    return _normalise_history(history)


def _read_cache() -> pd.DataFrame:
    cached = pd.read_csv(HISTORY_FILE, parse_dates=["Date"])
    if "Date" not in cached.columns:
        raise ValueError(f"{HISTORY_FILE.name} has no Date column.")
    cached = cached.set_index("Date")
    return _normalise_history(cached)


def load_or_update_raw_history() -> tuple[pd.DataFrame, str]:
    """Use today's cache when possible; otherwise fetch/merge Yahoo data."""
    today = date.today()
    cache_exists = HISTORY_FILE.exists()
    cached = _read_cache() if cache_exists else pd.DataFrame()

    # Avoid repeated network calls when the script is rerun on the same day.
    cache_was_updated_today = (
        cache_exists
        and datetime.fromtimestamp(HISTORY_FILE.stat().st_mtime).date() >= today
    )
    if cache_exists and cache_was_updated_today:
        return cached, f"Loaded local raw-data cache: {HISTORY_FILE.name}"

    try:
        start = (
            (cached.index.max().date() - timedelta(days=10))
            if not cached.empty
            else None
        )
        downloaded = _download_history(start)
        if downloaded.empty:
            raise RuntimeError("Yahoo Finance returned no EUR/USD daily rows.")
        combined = (
            pd.concat([cached, downloaded]).sort_index()
            if not cached.empty
            else downloaded
        )
        combined = combined[~combined.index.duplicated(keep="last")]
        combined.index.name = "Date"
        combined.to_csv(HISTORY_FILE, index=True, date_format="%Y-%m-%d")
        action = "Downloaded maximum-history" if start is None else "Updated"
        return combined, f"{action} raw EUR/USD data; saved {HISTORY_FILE.name}"
    except Exception as exc:
        if not cached.empty:
            return (
                cached,
                f"Yahoo refresh failed ({exc}); using cached data from "
                f"{cached.index.min().date()} through {cached.index.max().date()}.",
            )
        raise RuntimeError(
            f"Could not download EUR/USD history from Yahoo Finance: {exc}"
        ) from exc


def wilder_atr(frame: pd.DataFrame, period: int) -> pd.Series:
    previous_close = frame["Close"].shift(1)
    ranges = pd.concat(
        [
            frame["High"] - frame["Low"],
            (frame["High"] - previous_close).abs(),
            (frame["Low"] - previous_close).abs(),
        ],
        axis=1,
    )
    true_range = ranges.max(axis=1)
    if len(true_range):
        true_range.iloc[0] = frame["High"].iloc[0] - frame["Low"].iloc[0]

    values = np.full(len(frame), np.nan, dtype=float)
    ranges_array = true_range.to_numpy(dtype=float)
    if len(ranges_array) >= period:
        values[period - 1] = float(np.mean(ranges_array[:period]))
        for index in range(period, len(ranges_array)):
            values[index] = (
                values[index - 1] * (period - 1) + ranges_array[index]
            ) / period
    return pd.Series(values, index=frame.index, name=f"ATR{period}")


def wilder_rsi(close: pd.Series, period: int) -> pd.Series:
    changes = close.diff().to_numpy(dtype=float)
    values = np.full(len(close), np.nan, dtype=float)

    # Wilder's seed is the simple mean of the first `period` price changes.
    if len(changes) > period:
        gains = np.maximum(changes[1 : period + 1], 0.0)
        losses = np.maximum(-changes[1 : period + 1], 0.0)
        average_gain = float(np.mean(gains))
        average_loss = float(np.mean(losses))

        def rsi_value(gain: float, loss: float) -> float:
            if loss == 0:
                return 50.0 if gain == 0 else 100.0
            if gain == 0:
                return 0.0
            relative_strength = gain / loss
            return 100.0 - (100.0 / (1.0 + relative_strength))

        values[period] = rsi_value(average_gain, average_loss)
        for index in range(period + 1, len(changes)):
            gain = max(changes[index], 0.0)
            loss = max(-changes[index], 0.0)
            average_gain = ((period - 1) * average_gain + gain) / period
            average_loss = ((period - 1) * average_loss + loss) / period
            values[index] = rsi_value(average_gain, average_loss)

    return pd.Series(values, index=close.index, name=f"RSI{period}")


def add_indicators(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    result["EMA20"] = result["Close"].ewm(
        span=EMA_FAST, adjust=False, min_periods=EMA_FAST
    ).mean()
    result["EMA50"] = result["Close"].ewm(
        span=EMA_SLOW, adjust=False, min_periods=EMA_SLOW
    ).mean()
    result["ATR14"] = wilder_atr(result, ATR_PERIOD)
    result["RSI14"] = wilder_rsi(result["Close"], RSI_PERIOD)

    # Shift by one full candle: today's candle cannot influence its own levels.
    result["Prev20High"] = (
        result["High"].rolling(BREAKOUT_PERIOD, min_periods=BREAKOUT_PERIOD)
        .max()
        .shift(1)
    )
    result["Prev20Low"] = (
        result["Low"].rolling(BREAKOUT_PERIOD, min_periods=BREAKOUT_PERIOD)
        .min()
        .shift(1)
    )
    return result


def _score_parts(row: pd.Series, direction: str) -> dict[str, int]:
    is_bullish = direction == "bullish"
    trend = (
        row["Close"] > row["EMA20"] and row["EMA20"] > row["EMA50"]
        if is_bullish
        else row["Close"] < row["EMA20"] and row["EMA20"] < row["EMA50"]
    )
    breakout = (
        row["Close"] > row["Prev20High"]
        if is_bullish
        else row["Close"] < row["Prev20Low"]
    )
    momentum = row["RSI14"] >= 55 if is_bullish else row["RSI14"] <= 45

    atr_pct = row["ATR14"] / row["Close"] * 100.0
    volatility_ok = MIN_ATR_PCT <= atr_pct <= MAX_ATR_PCT

    # Transparent hypothetical breakout plan: stop = 1 ATR, target =
    # one prior 20-day channel width from the close. RR = channel width / ATR.
    prior_range = row["Prev20High"] - row["Prev20Low"]
    reward_risk = prior_range / row["ATR14"] if row["ATR14"] > 0 else np.nan
    reward_risk_ok = np.isfinite(reward_risk) and reward_risk >= 2.0

    return {
        "trend": int(bool(trend)),
        "breakout": int(bool(breakout)),
        "momentum": int(bool(momentum)),
        "volatility": int(bool(volatility_ok)),
        "reward_risk": int(bool(reward_risk_ok)),
    }


def _yes_no(value: bool) -> str:
    return "yes" if bool(value) else "no"


def _score_text(parts: dict[str, int]) -> str:
    labels = {
        "trend": "trend",
        "breakout": "breakout",
        "momentum": "momentum",
        "volatility": "volatility",
        "reward_risk": "R/R",
    }
    return ", ".join(f"{labels[key]}={value}" for key, value in parts.items())


def print_latest_state(raw: pd.DataFrame, source_message: str) -> None:
    if raw.empty:
        raise RuntimeError("No EUR/USD rows are available.")

    # Exclude the current calendar-date candle so a still-forming daily bar
    # cannot drive the state or breakout result.
    complete = raw.loc[raw.index < pd.Timestamp(date.today())].copy()
    if complete.empty:
        raise RuntimeError("No completed daily EUR/USD candles are available yet.")

    calculated = add_indicators(complete)
    ready = calculated.dropna(
        subset=[
            "EMA20",
            "EMA50",
            "ATR14",
            "RSI14",
            "Prev20High",
            "Prev20Low",
        ]
    )
    if ready.empty:
        raise RuntimeError(
            "Not enough completed history to calculate the requested indicators."
        )
    row = ready.iloc[-1]

    bullish_trend = row["Close"] > row["EMA20"] > row["EMA50"]
    bearish_trend = row["Close"] < row["EMA20"] < row["EMA50"]
    bullish_breakout = row["Close"] > row["Prev20High"]
    bearish_breakout = row["Close"] < row["Prev20Low"]
    bullish_momentum = row["RSI14"] >= 55
    bearish_momentum = row["RSI14"] <= 45
    atr_pct = row["ATR14"] / row["Close"] * 100.0
    volatility_ok = MIN_ATR_PCT <= atr_pct <= MAX_ATR_PCT

    bullish_parts = _score_parts(row, "bullish")
    bearish_parts = _score_parts(row, "bearish")
    bullish_score = sum(bullish_parts.values())
    bearish_score = sum(bearish_parts.values())

    print("FOREX TRADING ASSISTANT V1 — EUR/USD DAILY")
    print(source_message)
    print(f"Latest completed candle: {row.name:%Y-%m-%d}")
    print(f"Close: {row['Close']:.5f}")
    print(f"EMA 20: {row['EMA20']:.5f} | EMA 50: {row['EMA50']:.5f}")
    print(
        f"ATR 14: {row['ATR14']:.5f} ({atr_pct:.3f}% of close) | "
        f"RSI 14: {row['RSI14']:.2f}"
    )
    print(
        f"Previous 20-day high: {row['Prev20High']:.5f} | "
        f"previous 20-day low: {row['Prev20Low']:.5f}"
    )
    print("\nMARKET STATE")
    print(f"Bullish trend: {_yes_no(bullish_trend)}")
    print(f"Bearish trend: {_yes_no(bearish_trend)}")
    print(f"Bullish close breakout: {_yes_no(bullish_breakout)}")
    print(f"Bearish close breakout: {_yes_no(bearish_breakout)}")
    print(f"Bullish momentum (RSI >= 55): {_yes_no(bullish_momentum)}")
    print(f"Bearish momentum (RSI <= 45): {_yes_no(bearish_momentum)}")
    print(
        f"Acceptable volatility (ATR% {MIN_ATR_PCT:.2f}–"
        f"{MAX_ATR_PCT:.2f}%): {_yes_no(volatility_ok)}"
    )
    print(
        "Reward/risk: prior 20-day channel width as target reward, "
        "1 ATR as stop risk."
    )
    print(
        f"Bullish setup score: {bullish_score}/5 "
        f"({ _score_text(bullish_parts) })"
    )
    print(
        f"Bearish setup score: {bearish_score}/5 "
        f"({ _score_text(bearish_parts) })"
    )
    print("\nInformation only; this script does not place trades.")


def main() -> int:
    try:
        raw, source_message = load_or_update_raw_history()
        print_latest_state(raw, source_message)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())