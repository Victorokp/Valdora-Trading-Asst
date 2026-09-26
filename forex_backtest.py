#!/usr/bin/env python3
"""Fixed-rule EUR/USD daily backtest for Forex Trading Assistant V1."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import math
import sys

import numpy as np
import pandas as pd

import forex_assistant as assistant


STARTING_BALANCE = 1_000.0
RISK_PER_TRADE_PCT = 1.0
STOP_ATR_MULTIPLE = 1.5
TARGET_ATR_MULTIPLE = 3.0
MIN_TRADES_FOR_EVIDENCE = 30

RESULTS_DIR = Path(__file__).with_name("results")
TRADES_FILE = RESULTS_DIR / "forex_trades.csv"
SUMMARY_FILE = RESULTS_DIR / "forex_summary.txt"


@dataclass
class Position:
    side: str
    direction: int
    entry_date: pd.Timestamp
    entry_index: int
    signal_date: pd.Timestamp
    entry_price: float
    atr_at_signal: float
    stop_price: float
    target_price: float
    units_eur: float
    risk_usd: float
    balance_before: float


def build_signals(data: pd.DataFrame) -> pd.Series:
    """Return end-of-day signals from the exact V1 rules."""
    close = data["Close"]
    atr_pct = data["ATR14"] / close * 100.0
    acceptable_volatility = (
        atr_pct.between(assistant.MIN_ATR_PCT, assistant.MAX_ATR_PCT)
    )

    bullish = (
        (close > data["EMA20"])
        & (data["EMA20"] > data["EMA50"])
        & (close > data["Prev20High"])
        & (data["RSI14"] >= 55)
        & acceptable_volatility
    )
    bearish = (
        (close < data["EMA20"])
        & (data["EMA20"] < data["EMA50"])
        & (close < data["Prev20Low"])
        & (data["RSI14"] <= 45)
        & acceptable_volatility
    )

    signals = pd.Series(None, index=data.index, dtype=object, name="Signal")
    signals.loc[bullish] = "LONG"
    signals.loc[bearish] = "SHORT"
    return signals


def _open_position(
    side: str,
    entry_date: pd.Timestamp,
    entry_index: int,
    signal_date: pd.Timestamp,
    entry_price: float,
    signal_atr: float,
    balance: float,
) -> Position | None:
    if (
        not np.isfinite(signal_atr)
        or signal_atr <= 0
        or not np.isfinite(entry_price)
        or entry_price <= 0
        or balance <= 0
    ):
        return None

    direction = 1 if side == "LONG" else -1
    stop_distance = STOP_ATR_MULTIPLE * signal_atr
    target_distance = TARGET_ATR_MULTIPLE * signal_atr
    risk_usd = balance * RISK_PER_TRADE_PCT / 100.0
    units_eur = risk_usd / stop_distance
    if side == "LONG":
        stop_price = entry_price - stop_distance
        target_price = entry_price + target_distance
    else:
        stop_price = entry_price + stop_distance
        target_price = entry_price - target_distance

    return Position(
        side=side,
        direction=direction,
        entry_date=entry_date,
        entry_index=entry_index,
        signal_date=signal_date,
        entry_price=float(entry_price),
        atr_at_signal=float(signal_atr),
        stop_price=float(stop_price),
        target_price=float(target_price),
        units_eur=float(units_eur),
        risk_usd=float(risk_usd),
        balance_before=float(balance),
    )


def simulate_period(
    data: pd.DataFrame,
    signals: pd.Series,
    start_index: int,
    stop_index: int,
    period_name: str,
) -> tuple[dict, list[dict]]:
    """Replay one date window, starting flat with a fresh $1,000 balance."""
    balance = STARTING_BALANCE
    position: Position | None = None
    trades: list[dict] = []
    equity_curve = [STARTING_BALANCE]
    period_data = data.iloc[start_index:stop_index]

    def close_position(
        exit_price: float,
        exit_index: int,
        exit_reason: str,
    ) -> None:
        nonlocal balance, position
        if position is None:
            return
        current = position
        pnl_usd = (
            current.direction
            * current.units_eur
            * (float(exit_price) - current.entry_price)
        )
        balance_after = balance + pnl_usd
        r_multiple = pnl_usd / current.risk_usd
        trades.append(
            {
                "evaluation_period": period_name,
                "trade_number": len(trades) + 1,
                "side": current.side,
                "signal_date": current.signal_date.strftime("%Y-%m-%d"),
                "entry_date": current.entry_date.strftime("%Y-%m-%d"),
                "entry_price": current.entry_price,
                "atr14_on_signal": current.atr_at_signal,
                "stop_price": current.stop_price,
                "target_price": current.target_price,
                "exit_date": data.index[exit_index].strftime("%Y-%m-%d"),
                "exit_price": float(exit_price),
                "exit_reason": exit_reason,
                "units_eur": current.units_eur,
                "risk_usd": current.risk_usd,
                "pnl_usd": pnl_usd,
                "r_multiple": r_multiple,
                "duration_sessions": exit_index - current.entry_index + 1,
                "balance_before": current.balance_before,
                "balance_after": balance_after,
            }
        )
        balance = balance_after
        position = None

    for local_index, (current_date, row) in enumerate(period_data.iterrows()):
        global_index = start_index + local_index
        previous_signal = (
            signals.iloc[global_index - 1]
            if global_index > start_index
            else None
        )
        if pd.isna(previous_signal):
            previous_signal = None
        previous_row = (
            data.iloc[global_index - 1]
            if global_index > start_index
            else None
        )

        position_at_open = position is not None
        reverse_on_open = False
        exited_by_bracket_at_open = False

        # Existing stop/target orders take precedence over a scheduled
        # opposite-setup exit when the open has gapped through a bracket.
        if position is not None:
            if position.side == "LONG" and row["Open"] <= position.stop_price:
                close_position(row["Open"], global_index, "gap_through_stop")
                exited_by_bracket_at_open = True
            elif position.side == "LONG" and row["Open"] >= position.target_price:
                # Conservatively fill a target gap at the target, not at the
                # potentially better opening price.
                close_position(
                    position.target_price, global_index, "target_gap"
                )
                exited_by_bracket_at_open = True
            elif position.side == "SHORT" and row["Open"] >= position.stop_price:
                close_position(row["Open"], global_index, "gap_through_stop")
                exited_by_bracket_at_open = True
            elif position.side == "SHORT" and row["Open"] <= position.target_price:
                close_position(
                    position.target_price, global_index, "target_gap"
                )
                exited_by_bracket_at_open = True
            elif (
                previous_signal is not None
                and previous_signal != position.side
            ):
                # The opposite setup was confirmed at the prior close and is
                # executed at this open. A reversal at the same open is allowed
                # after the old position has been fully closed.
                close_position(row["Open"], global_index, "opposite_setup_open")
                reverse_on_open = True

        if (
            position is None
            and previous_signal is not None
            and previous_row is not None
            and (not position_at_open or reverse_on_open)
            and not exited_by_bracket_at_open
        ):
            position = _open_position(
                side=previous_signal,
                entry_date=current_date,
                entry_index=global_index,
                signal_date=data.index[global_index - 1],
                entry_price=row["Open"],
                signal_atr=previous_row["ATR14"],
                balance=balance,
            )

        if position is not None:
            stop_hit = (
                row["Low"] <= position.stop_price
                if position.side == "LONG"
                else row["High"] >= position.stop_price
            )
            target_hit = (
                row["High"] >= position.target_price
                if position.side == "LONG"
                else row["Low"] <= position.target_price
            )
            if stop_hit and target_hit:
                close_position(
                    position.stop_price,
                    global_index,
                    "stop_and_target_same_candle_conservative_stop",
                )
            elif stop_hit:
                close_position(
                    position.stop_price, global_index, "stop"
                )
            elif target_hit:
                close_position(
                    position.target_price, global_index, "target"
                )

        close_equity = balance
        if position is not None:
            close_equity += (
                position.direction
                * position.units_eur
                * (row["Close"] - position.entry_price)
            )
        equity_curve.append(float(close_equity))

    if period_data.empty:
        raise ValueError(f"No data rows in evaluation window {period_name}.")

    # Liquidate any remaining trade at the last period close so every run has
    # a realized ending balance and every opened trade is included in metrics.
    if position is not None:
        final_index = stop_index - 1
        close_position(
            data["Close"].iloc[final_index],
            final_index,
            "period_end_close",
        )
        equity_curve[-1] = float(balance)

    trade_frame = pd.DataFrame(trades)
    stats = calculate_metrics(
        period_name=period_name,
        start_date=period_data.index[0],
        end_date=period_data.index[-1],
        starting_balance=STARTING_BALANCE,
        ending_balance=balance,
        equity_curve=equity_curve,
        trades=trade_frame,
    )
    return stats, trades


def calculate_metrics(
    period_name: str,
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
    starting_balance: float,
    ending_balance: float,
    equity_curve: list[float],
    trades: pd.DataFrame,
) -> dict:
    if trades.empty:
        pnls = pd.Series(dtype=float)
        rs = pd.Series(dtype=float)
        durations = pd.Series(dtype=float)
    else:
        pnls = trades["pnl_usd"].astype(float)
        rs = trades["r_multiple"].astype(float)
        durations = trades["duration_sessions"].astype(float)

    winners = pnls[pnls > 0]
    losers = pnls[pnls < 0]
    winning_rs = rs[pnls > 0] if len(rs) else pd.Series(dtype=float)
    losing_rs = rs[pnls < 0] if len(rs) else pd.Series(dtype=float)
    gross_wins = float(winners.sum()) if len(winners) else 0.0
    gross_losses = abs(float(losers.sum())) if len(losers) else 0.0
    profit_factor = (
        gross_wins / gross_losses
        if gross_losses > 0
        else (math.inf if gross_wins > 0 else math.nan)
    )

    curve = np.asarray(equity_curve, dtype=float)
    running_peak = np.maximum.accumulate(curve)
    drawdowns = np.divide(
        running_peak - curve,
        running_peak,
        out=np.zeros_like(curve),
        where=running_peak != 0,
    )
    max_drawdown_pct = float(drawdowns.max() * 100.0) if len(drawdowns) else 0.0
    max_drawdown_usd = (
        float((running_peak - curve).max()) if len(curve) else 0.0
    )

    trade_count = len(trades)
    win_count = int((pnls > 0).sum()) if trade_count else 0
    loss_count = int((pnls < 0).sum()) if trade_count else 0
    breakeven_count = trade_count - win_count - loss_count

    def maybe_mean(series: pd.Series) -> float:
        return float(series.mean()) if len(series) else math.nan

    largest_win = (
        trades.loc[trades["pnl_usd"].idxmax()].to_dict()
        if win_count
        else None
    )
    largest_loss = (
        trades.loc[trades["pnl_usd"].idxmin()].to_dict()
        if loss_count
        else None
    )

    return {
        "period": period_name,
        "start_date": pd.Timestamp(start_date),
        "end_date": pd.Timestamp(end_date),
        "starting_balance": starting_balance,
        "ending_balance": float(ending_balance),
        "total_return_pct": (
            (ending_balance / starting_balance - 1.0) * 100.0
            if starting_balance
            else math.nan
        ),
        "trade_count": trade_count,
        "wins": win_count,
        "losses": loss_count,
        "breakeven": breakeven_count,
        "win_rate_pct": (
            win_count / trade_count * 100.0 if trade_count else math.nan
        ),
        "average_win_r": maybe_mean(winning_rs),
        "average_loss_r": maybe_mean(losing_rs),
        "average_r_per_trade": maybe_mean(rs),
        "expectancy_usd_per_trade": maybe_mean(pnls),
        "expectancy_r": maybe_mean(rs),
        "profit_factor": profit_factor,
        "max_drawdown_pct": max_drawdown_pct,
        "max_drawdown_usd": max_drawdown_usd,
        "average_duration_sessions": maybe_mean(durations),
        "largest_win_usd": (
            float(largest_win["pnl_usd"]) if largest_win else math.nan
        ),
        "largest_win_r": (
            float(largest_win["r_multiple"]) if largest_win else math.nan
        ),
        "largest_loss_usd": (
            float(largest_loss["pnl_usd"]) if largest_loss else math.nan
        ),
        "largest_loss_r": (
            float(largest_loss["r_multiple"]) if largest_loss else math.nan
        ),
    }


def _fmt(value: float, digits: int = 2, suffix: str = "") -> str:
    if value is None or not np.isfinite(value):
        if value is not None and value == math.inf:
            return "∞"
        if value is not None and value == -math.inf:
            return "-∞"
        return "n/a"
    return f"{value:.{digits}f}{suffix}"


def _money(value: float) -> str:
    if value is None or not np.isfinite(value):
        return "n/a"
    sign = "-$" if value < 0 else "$"
    return f"{sign}{abs(value):,.2f}"


def classify_evidence(full: dict, holdout: dict) -> tuple[str, str]:
    """Apply fixed evidence rules to observed counts, expectancy, and PF."""
    if (
        full["trade_count"] < MIN_TRADES_FOR_EVIDENCE
        or holdout["trade_count"] < MIN_TRADES_FOR_EVIDENCE
    ):
        label = "INSUFFICIENT SAMPLE SIZE"
        explanation = (
            f"The fixed minimum is {MIN_TRADES_FOR_EVIDENCE} closed trades "
            "in both full history and holdout; at least one period has fewer."
        )
        return label, explanation

    full_positive = (
        full["expectancy_r"] > 0 and full["profit_factor"] > 1
    )
    holdout_positive = (
        holdout["expectancy_r"] > 0 and holdout["profit_factor"] > 1
    )
    full_negative = (
        full["expectancy_r"] < 0 and full["profit_factor"] < 1
    )
    holdout_negative = (
        holdout["expectancy_r"] < 0 and holdout["profit_factor"] < 1
    )
    if full_positive and holdout_positive:
        return (
            "POSITIVE EXPECTANCY",
            "Both full-history and holdout mean R are positive and both "
            "profit factors exceed 1.",
        )
    if full_negative and holdout_negative:
        return (
            "NEGATIVE EXPECTANCY",
            "Both full-history and holdout mean R are negative and both "
            "profit factors are below 1.",
        )
    return (
        "WEAK / INCONCLUSIVE EVIDENCE",
        "Full-history and holdout expectancy/profit-factor results do not "
        "agree under the fixed classification rule.",
    )


def _metric_row(stats: dict) -> str:
    return (
        f"{stats['period']} | "
        f"{stats['start_date']:%Y-%m-%d} to {stats['end_date']:%Y-%m-%d} | "
        f"${stats['starting_balance']:,.2f} | "
        f"{stats['trade_count']} | {stats['wins']} | {stats['losses']} | "
        f"{stats['breakeven']} | {_fmt(stats['win_rate_pct'], suffix='%')} | "
        f"{_fmt(stats['average_win_r'], digits=4, suffix='R')} | "
        f"{_fmt(stats['average_loss_r'], digits=4, suffix='R')} | "
        f"{_fmt(stats['average_r_per_trade'], digits=4, suffix='R')} | "
        f"{_money(stats['expectancy_usd_per_trade'])} | "
        f"{_fmt(stats['profit_factor'], digits=3)} | "
        f"{_money(stats['ending_balance'])} | "
        f"{_fmt(stats['total_return_pct'], suffix='%')} | "
        f"{_fmt(stats['max_drawdown_pct'], suffix='%')} "
        f"({_money(stats['max_drawdown_usd'])}) | "
        f"{_fmt(stats['average_duration_sessions'])} | "
        f"{_money(stats['largest_win_usd'])} "
        f"({_fmt(stats['largest_win_r'], digits=4, suffix='R')}) | "
        f"{_money(stats['largest_loss_usd'])} "
        f"({_fmt(stats['largest_loss_r'], digits=4, suffix='R')})"
    )


def build_summary(
    metrics: list[dict],
    classification: str,
    explanation: str,
    candle_count: int,
) -> str:
    lines = [
        "FOREX TRADING ASSISTANT V1 — EUR/USD BACKTEST",
        f"Data: read-only local cache {assistant.HISTORY_FILE.name}; "
        f"{candle_count:,} completed daily candles used.",
        f"History: {metrics[0]['start_date']:%Y-%m-%d} through "
        f"{metrics[0]['end_date']:%Y-%m-%d}.",
        "",
        "FIXED RULES — NO OPTIMIZATION",
        "Bullish setup: Close > EMA20 > EMA50; Close > prior 20-candle High; "
        "RSI14 >= 55; ATR14/Close is 0.10%–1.50%.",
        "Bearish setup: Close < EMA20 < EMA50; Close < prior 20-candle Low; "
        "RSI14 <= 45; ATR14/Close is 0.10%–1.50%.",
        "The breakout levels are rolling 20-candle High/Low shifted by one "
        "candle, so the signal candle is excluded.",
        "Signal is evaluated at candle T close; an entry is at candle T+1 Open. "
        "Stops and targets use ATR14 known at T: stop = 1.5 ATR; target = 3 ATR.",
        "One position at a time. An opposite valid setup closes at the next "
        "Open; a reversal may enter at that same Open after closing the old trade.",
        "",
        "EXECUTION / ACCOUNTING ASSUMPTIONS",
        f"Every independent run starts flat with ${STARTING_BALANCE:,.2f}. "
        f"Each position risks {RISK_PER_TRADE_PCT:.2f}% of available balance "
        "to its initial stop; EUR units = risk dollars / stop distance. "
        "Position size is uncapped (no leverage cap).",
        "Raw Yahoo OHLC is used. Spread, commission, slippage, financing/swap, "
        "and interest on idle cash are not modeled; results are gross and "
        "optimistic versus live FX execution.",
        "If a candle touches both stop and target and daily data cannot reveal "
        "the order, the stop is assumed to hit first. A stop gap fills at the "
        "worse opening price; a target gap fills at the target (not the better "
        "open). A still-open trade is liquidated at the final period Close.",
        "Trade duration is counted in trading sessions, including the entry "
        "session. Maximum drawdown is measured from daily close-to-close equity, "
        "including unrealized P&L.",
        "Expectancy USD/trade is average realized P&L; expectancy R is average "
        "realized R and equals average R/trade. Average loss R is signed negative.",
        "",
        "RESULTS",
        "Period | Dates | Start | Trades | Wins | Losses | BE | Win rate | "
        "Avg win R | Avg loss R | Avg R/trade | Expectancy USD/trade | PF | "
        "End balance | Total return | Max DD | Avg duration sessions | "
        "Largest win USD (R) | Largest loss USD (R)",
    ]
    lines.extend(_metric_row(stats) for stats in metrics)
    full = next(item for item in metrics if item["period"] == "full_history")
    holdout = next(item for item in metrics if item["period"] == "holdout_30pct")
    lines.extend(
        [
            "",
            "EVIDENCE CLASSIFICATION",
            f"Classification: {classification}.",
            explanation,
        f"Full history: {full['trade_count']} trades, expectancy "
        f"{_fmt(full['expectancy_r'], digits=4, suffix='R')} per trade, PF "
        f"{_fmt(full['profit_factor'], digits=3)}.",
            f"Holdout: {holdout['trade_count']} trades, expectancy "
            f"{_fmt(holdout['expectancy_r'], digits=4, suffix='R')} per trade, PF "
            f"{_fmt(holdout['profit_factor'], digits=3)}.",
            f"The sample-size cutoff of {MIN_TRADES_FOR_EVIDENCE} trades in "
            "both full history and holdout is a fixed reporting rule, not a "
            "strategy parameter and not a guarantee of statistical power.",
            "",
            f"Trade ledger: {TRADES_FILE.relative_to(Path(__file__).parent)}. "
            "It contains separate rows for each independent evaluation window; "
            "a trade can appear in more than one window.",
        ]
    )
    return "\n".join(lines) + "\n"


def run_backtest() -> tuple[list[dict], list[dict], str, str, int]:
    if not assistant.HISTORY_FILE.exists():
        raise FileNotFoundError(
            f"Required local cache does not exist: {assistant.HISTORY_FILE}"
        )
    # Intentionally read only: do not refresh or modify the user's price cache.
    raw = assistant._read_cache()
    today = pd.Timestamp(date.today())
    completed = raw.loc[raw.index < today].copy()
    if completed.empty:
        raise RuntimeError("No completed EUR/USD candles are available in cache.")

    data = assistant.add_indicators(completed)
    signals = build_signals(data)
    row_count = len(data)
    if row_count < 3:
        raise RuntimeError("Not enough daily candles for chronological splits.")

    split_at = int(row_count * 0.70)
    if split_at <= 0 or split_at >= row_count:
        raise RuntimeError("The 70/30 split did not produce two non-empty periods.")

    third_chunks = np.array_split(np.arange(row_count), 3)
    windows = [
        ("full_history", 0, row_count),
        ("development_70pct", 0, split_at),
        ("holdout_30pct", split_at, row_count),
    ]
    for number, chunk in enumerate(third_chunks, start=1):
        windows.append(
            (
                f"chronological_{number}_of_3",
                int(chunk[0]),
                int(chunk[-1]) + 1,
            )
        )

    metrics = []
    all_trades = []
    for period_name, start_index, stop_index in windows:
        stats, trades = simulate_period(
            data,
            signals,
            start_index,
            stop_index,
            period_name,
        )
        metrics.append(stats)
        all_trades.extend(trades)

    full = next(item for item in metrics if item["period"] == "full_history")
    holdout = next(item for item in metrics if item["period"] == "holdout_30pct")
    classification, explanation = classify_evidence(full, holdout)
    return metrics, all_trades, classification, explanation, row_count


def main() -> int:
    try:
        metrics, trades, classification, explanation, candle_count = run_backtest()
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)

        trade_columns = [
            "evaluation_period",
            "trade_number",
            "side",
            "signal_date",
            "entry_date",
            "entry_price",
            "atr14_on_signal",
            "stop_price",
            "target_price",
            "exit_date",
            "exit_price",
            "exit_reason",
            "units_eur",
            "risk_usd",
            "pnl_usd",
            "r_multiple",
            "duration_sessions",
            "balance_before",
            "balance_after",
        ]
        pd.DataFrame(trades, columns=trade_columns).to_csv(
            TRADES_FILE, index=False, float_format="%.8f"
        )

        full = next(item for item in metrics if item["period"] == "full_history")
        holdout = next(item for item in metrics if item["period"] == "holdout_30pct")
        summary = build_summary(
            metrics,
            classification,
            explanation,
            candle_count,
        )
        SUMMARY_FILE.write_text(summary, encoding="utf-8")

        print(summary, end="")
        print(
            f"\nSaved {len(trades)} trade rows across "
            f"{len(metrics)} independent evaluation windows:"
        )
        print(f"  {TRADES_FILE}")
        print(f"  {SUMMARY_FILE}")
        print(
            f"\nDecision: {classification} "
            f"(full expectancy {_fmt(full['expectancy_r'], suffix='R')}; "
            f"holdout expectancy {_fmt(holdout['expectancy_r'], suffix='R')})."
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())