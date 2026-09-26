import argparse
import csv
import math
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import yfinance as yf
from ta.momentum import RSIIndicator


STARTING_CAPITAL = 10_000.0
RSI_WINDOW = 14
BUY_RSI = 30.0
SELL_RSI = 70.0
STOP_LOSS = 0.05
DATA_PERIOD = "max"
DATA_INTERVAL = "1d"
DEVELOPMENT_FRACTION = 0.70

TRANSACTION_COSTS = (0.0, 0.0005, 0.001)
SLIPPAGES = (0.0, 0.0005, 0.001)

OUTPUT_DIR = Path(__file__).resolve().parent
PRICE_SNAPSHOT = OUTPUT_DIR / "spy_prices.csv"
RESULTS_PATH = OUTPUT_DIR / "results.csv"
SUMMARY_PATH = OUTPUT_DIR / "summary.txt"


@dataclass(frozen=True)
class PositionSizing:
    name: str
    mode: str
    amount: float


SIZING_CONFIGS = (
    PositionSizing("fixed_10_shares", "fixed_shares", 10.0),
    PositionSizing("10pct_equity", "equity_fraction", 0.10),
    PositionSizing("25pct_equity", "equity_fraction", 0.25),
    PositionSizing("50pct_equity", "equity_fraction", 0.50),
)


def _extract_field(downloaded, field):
    """Extract a single SPY field from flat or either orientation of MultiIndex columns."""
    if isinstance(downloaded.columns, pd.MultiIndex):
        field_level = None
        field_label = None
        for level in range(downloaded.columns.nlevels):
            labels = downloaded.columns.get_level_values(level)
            match = next(
                (label for label in labels if str(label).casefold() == field.casefold()),
                None,
            )
            if match is not None:
                field_level = level
                field_label = match
                break
        if field_level is None:
            return None
        values = downloaded.xs(
            field_label, axis=1, level=field_level, drop_level=True
        )
    else:
        matching_columns = [
            column
            for column in downloaded.columns
            if str(column).casefold() == field.casefold()
        ]
        if not matching_columns:
            return None
        values = downloaded[matching_columns[0]]

    if isinstance(values, pd.DataFrame):
        spy_columns = [
            column for column in values.columns
            if str(column).upper() == "SPY"
        ]
        if spy_columns:
            values = values[spy_columns[0]]
        elif values.shape[1] == 1:
            values = values.iloc[:, 0]
        else:
            raise ValueError(f"Could not select a unique SPY {field} column.")
    return values


def normalize_market_data(downloaded):
    """Normalize adjusted OHLC data and preserve missing opens/lows without inventing values."""
    if downloaded is None or downloaded.empty:
        raise RuntimeError("yfinance returned no SPY data; no results were generated.")

    fields = {}
    for field in ("Open", "High", "Low", "Close", "Volume"):
        values = _extract_field(downloaded, field)
        if values is not None:
            fields[field] = pd.to_numeric(values, errors="coerce")

    required = ("Open", "Low", "Close")
    missing = [field for field in required if field not in fields]
    if missing:
        raise ValueError(f"SPY history is missing required field(s): {missing}")

    market = pd.DataFrame(fields, index=downloaded.index)
    if isinstance(market.index, pd.DatetimeIndex) and market.index.tz is not None:
        market.index = market.index.tz_localize(None)
    market = market[~market.index.duplicated(keep="first")].sort_index()
    market = market.loc[market["Close"].notna()].copy()
    if market.empty:
        raise RuntimeError("SPY history has no valid adjusted closing prices.")
    return market


def load_snapshot():
    if not PRICE_SNAPSHOT.exists():
        raise FileNotFoundError(
            f"{PRICE_SNAPSHOT.name} is missing. Run with --refresh-data to download it."
        )
    frame = pd.read_csv(PRICE_SNAPSHOT, parse_dates=["Date"])
    if "Date" not in frame.columns:
        raise ValueError(f"{PRICE_SNAPSHOT.name} must contain a Date column.")
    for field in ("Open", "Low", "Close"):
        if field not in frame.columns:
            raise ValueError(
                f"{PRICE_SNAPSHOT.name} is missing required {field} data."
            )
    market = frame.set_index("Date")
    for field in market.columns:
        market[field] = pd.to_numeric(market[field], errors="coerce")
    market = market[~market.index.duplicated(keep="first")].sort_index()
    market = market.loc[market["Close"].notna()].copy()
    if market.empty:
        raise ValueError(f"{PRICE_SNAPSHOT.name} contains no valid SPY data.")
    return market


def save_snapshot(market):
    snapshot = market.copy()
    snapshot.index.name = "Date"
    snapshot.to_csv(
        PRICE_SNAPSHOT,
        date_format="%Y-%m-%d",
        float_format="%.17g",
    )


def finite_or_none(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def calculate_rsi(close_prices):
    # RSI is calculated once on the full chronological series. Its trailing
    # calculation uses no future rows, and gives each subperiod prior context.
    return RSIIndicator(close=close_prices, window=RSI_WINDOW).rsi()


def _annualized_return(final_value, first_date, last_date):
    elapsed_days = max((last_date - first_date).days, 1)
    elapsed_years = elapsed_days / 365.25
    if final_value <= 0:
        return -100.0
    return ((final_value / STARTING_CAPITAL) ** (1 / elapsed_years) - 1) * 100


def simulate_strategy(
    market,
    rsi_values,
    start,
    end,
    sizing,
    transaction_cost,
    slippage,
):
    """Use close-generated RSI signals at the next open; stops use daily OHLC."""
    period = market.iloc[start:end]
    period_rsi = rsi_values.iloc[start:end]
    if period.empty:
        raise ValueError("Cannot backtest an empty date range.")

    cash = STARTING_CAPITAL
    shares = 0.0
    entry_fill_price = 0.0
    entry_total_cost = 0.0
    pending_signal = None
    completed_pnls = []
    equity_curve = [STARTING_CAPITAL]
    exposure_days = 0
    skipped_signals_missing_open = 0

    def close_position(quoted_price):
        nonlocal cash, shares, entry_fill_price, entry_total_cost
        if shares <= 0:
            return
        sell_fill = quoted_price * (1 - slippage)
        gross_proceeds = shares * sell_fill
        net_proceeds = gross_proceeds * (1 - transaction_cost)
        cash += net_proceeds
        completed_pnls.append(net_proceeds - entry_total_cost)
        shares = 0.0
        entry_fill_price = 0.0
        entry_total_cost = 0.0

    def open_position(quoted_open):
        nonlocal cash, shares, entry_fill_price, entry_total_cost
        if cash <= 0:
            return False
        buy_fill = quoted_open * (1 + slippage)
        if sizing.mode == "fixed_shares":
            quantity = sizing.amount
        else:
            # No other position is open when a new entry is placed. The cash
            # budget includes buy-side transaction costs; this prevents leverage.
            budget = cash * sizing.amount
            quantity = budget / (buy_fill * (1 + transaction_cost))
        total_cost = quantity * buy_fill * (1 + transaction_cost)
        if quantity <= 0 or total_cost > cash + 1e-9:
            return False
        shares = quantity
        cash = max(0.0, cash - total_cost)
        entry_fill_price = buy_fill
        entry_total_cost = total_cost
        return True

    for date, row in period.iterrows():
        open_price = finite_or_none(row["Open"])
        low_price = finite_or_none(row["Low"])
        close_price = float(row["Close"])
        signal_to_execute = pending_signal
        pending_signal = None

        # A gap through the stop is filled at the observed open, not at the
        # more favorable stop level. The sale slippage and cost are then applied.
        if shares > 0 and open_price is not None:
            stop_level = entry_fill_price * (1 - STOP_LOSS)
            if open_price <= stop_level:
                close_position(open_price)

        # RSI signals were formed at the previous close. Missing next open means
        # the order is skipped rather than filled with an invented price.
        if signal_to_execute is not None:
            if open_price is None or open_price <= 0:
                skipped_signals_missing_open += 1
            elif signal_to_execute == "buy" and shares == 0:
                open_position(open_price)
            elif signal_to_execute == "sell" and shares > 0:
                close_position(open_price)

        # Intraday stop: if the open stayed above the stop but today's low
        # crossed it, use the stop level as the quoted fill before slippage.
        # If the open itself is missing, do not infer gap behavior from the low.
        if shares > 0 and open_price is not None and low_price is not None:
            stop_level = entry_fill_price * (1 - STOP_LOSS)
            if open_price > stop_level and low_price <= stop_level:
                close_position(stop_level)

        if shares > 0:
            exposure_days += 1

        rsi_value = period_rsi.loc[date]
        if pd.notna(rsi_value):
            if shares == 0 and float(rsi_value) < BUY_RSI:
                pending_signal = "buy"
            elif shares > 0 and float(rsi_value) > SELL_RSI:
                pending_signal = "sell"

        # End-of-day equity is net liquidation value, including estimated
        # sell-side slippage and costs on any open position.
        liquidation_price = close_price * (1 - slippage) * (1 - transaction_cost)
        equity_curve.append(cash + shares * liquidation_price)

    final_close = float(period["Close"].iloc[-1])
    final_value = cash + shares * final_close * (1 - slippage) * (
        1 - transaction_cost
    )
    total_return_pct = (final_value / STARTING_CAPITAL - 1) * 100

    peak_equity = STARTING_CAPITAL
    maximum_drawdown_pct = 0.0
    for equity in equity_curve:
        peak_equity = max(peak_equity, equity)
        if peak_equity > 0:
            drawdown_pct = (peak_equity - equity) / peak_equity * 100
            maximum_drawdown_pct = max(maximum_drawdown_pct, drawdown_pct)

    winners = [pnl for pnl in completed_pnls if pnl > 0]
    losers = [pnl for pnl in completed_pnls if pnl < 0]
    gross_wins = sum(winners)
    gross_losses = abs(sum(losers))
    if not completed_pnls:
        profit_factor = None
    elif gross_losses == 0:
        profit_factor = math.inf if gross_wins > 0 else None
    else:
        profit_factor = gross_wins / gross_losses

    losing_streak = 0
    largest_losing_streak = 0
    for pnl in completed_pnls:
        if pnl < 0:
            losing_streak += 1
            largest_losing_streak = max(largest_losing_streak, losing_streak)
        else:
            losing_streak = 0

    return {
        "final_value": final_value,
        "total_return_pct": total_return_pct,
        "annualized_return_pct": _annualized_return(
            final_value, period.index[0], period.index[-1]
        ),
        "max_drawdown_pct": maximum_drawdown_pct,
        "completed_trades": len(completed_pnls),
        "win_rate_pct": (
            len(winners) / len(completed_pnls) * 100 if completed_pnls else None
        ),
        "average_winning_trade_usd": (
            sum(winners) / len(winners) if winners else None
        ),
        "average_losing_trade_usd": (
            sum(losers) / len(losers) if losers else None
        ),
        "profit_factor": profit_factor,
        "largest_losing_streak": largest_losing_streak,
        "exposure_days": exposure_days,
        "exposure_pct": exposure_days / len(period) * 100,
        "period_trading_days": len(period),
        "open_shares_at_end": shares,
        "skipped_signals_missing_open": skipped_signals_missing_open,
    }


def calculate_buy_and_hold(market, start, end, transaction_cost, slippage):
    period = market.iloc[start:end]
    if period.empty:
        raise ValueError("Cannot calculate buy-and-hold on an empty date range.")
    first_open = finite_or_none(period["Open"].iloc[0])
    last_close = finite_or_none(period["Close"].iloc[-1])
    if first_open is None or first_open <= 0:
        raise ValueError(
            f"Buy-and-hold cannot start: first Open is missing at "
            f"{period.index[0].date()}."
        )
    if last_close is None or last_close <= 0:
        raise ValueError("Buy-and-hold cannot exit: final Close is missing.")

    buy_fill = first_open * (1 + slippage)
    shares = STARTING_CAPITAL / (buy_fill * (1 + transaction_cost))
    sell_fill = last_close * (1 - slippage)
    final_value = shares * sell_fill * (1 - transaction_cost)
    return {
        "final_value": final_value,
        "return_pct": (final_value / STARTING_CAPITAL - 1) * 100,
    }


def date_range_positions(market, start_date, end_date_exclusive):
    dates = market.index
    start_position = int(dates.searchsorted(pd.Timestamp(start_date), side="left"))
    end_position = int(
        dates.searchsorted(pd.Timestamp(end_date_exclusive), side="left")
    )
    start_position = max(0, min(start_position, len(market)))
    end_position = max(0, min(end_position, len(market)))
    if end_position <= start_position:
        return None
    return start_position, end_position


def build_periods(market):
    total_rows = len(market)
    split = int(total_rows * DEVELOPMENT_FRACTION)
    split = max(1, min(split, total_rows - 1))
    periods = {
        "full_history": (0, total_rows),
        "development_70pct": (0, split),
        "holdout_30pct": (split, total_rows),
    }
    for name, first, end in (
        ("2010-2015", "2010-01-01", "2016-01-01"),
        ("2016-2020", "2016-01-01", "2021-01-01"),
        ("2021-2026", "2021-01-01", "2027-01-01"),
    ):
        positions = date_range_positions(market, first, end)
        if positions is not None:
            periods[name] = positions
    return periods, split


def fmt_money(value):
    return "n/a" if value is None else f"${value:,.2f}"


def fmt_pct(value):
    return "n/a" if value is None else f"{value:.2f}%"


def format_pct(value):
    return fmt_pct(value)


def fmt_factor(value):
    if value is None:
        return "n/a"
    if math.isinf(value):
        return "∞"
    return f"{value:.2f}"


def csv_value(value, digits=8):
    if value is None or (isinstance(value, float) and math.isinf(value)):
        return value
    if isinstance(value, (int, bool, str)):
        return value
    return round(float(value), digits)


def make_csv_row(period_name, market, start, end, sizing, cost, slippage, metrics, benchmark):
    period = market.iloc[start:end]
    return {
        "period": period_name,
        "start_date": period.index[0].strftime("%Y-%m-%d"),
        "end_date": period.index[-1].strftime("%Y-%m-%d"),
        "trading_days": metrics["period_trading_days"],
        "rsi_window": RSI_WINDOW,
        "buy_rsi_below": BUY_RSI,
        "sell_rsi_above": SELL_RSI,
        "stop_loss_pct": STOP_LOSS * 100,
        "position_sizing": sizing.name,
        "position_sizing_mode": sizing.mode,
        "position_sizing_amount": sizing.amount,
        "transaction_cost_pct_per_side": cost * 100,
        "slippage_pct_per_side": slippage * 100,
        "strategy_final_value": csv_value(metrics["final_value"], 6),
        "total_return_pct": csv_value(metrics["total_return_pct"], 8),
        "annualized_return_pct": csv_value(metrics["annualized_return_pct"], 8),
        "max_drawdown_pct": csv_value(metrics["max_drawdown_pct"], 8),
        "completed_trades": metrics["completed_trades"],
        "win_rate_pct": csv_value(metrics["win_rate_pct"], 8),
        "average_winning_trade_usd": csv_value(
            metrics["average_winning_trade_usd"], 6
        ),
        "average_losing_trade_usd": csv_value(
            metrics["average_losing_trade_usd"], 6
        ),
        "profit_factor": csv_value(metrics["profit_factor"], 8),
        "largest_losing_streak": metrics["largest_losing_streak"],
        "exposure_days": metrics["exposure_days"],
        "exposure_pct": csv_value(metrics["exposure_pct"], 8),
        "open_shares_at_end": csv_value(metrics["open_shares_at_end"], 10),
        "skipped_signals_missing_open": metrics["skipped_signals_missing_open"],
        "buy_hold_final_value": csv_value(benchmark["final_value"], 6),
        "buy_hold_return_pct": csv_value(benchmark["return_pct"], 8),
        "excess_return_vs_buy_hold_pp": csv_value(
            metrics["total_return_pct"] - benchmark["return_pct"], 8
        ),
    }


def build_report(market, periods, split, results, reference_cost, reference_slippage):
    first_date = market.index[0].strftime("%Y-%m-%d")
    last_date = market.index[-1].strftime("%Y-%m-%d")
    split_date = market.index[split].strftime("%Y-%m-%d")

    def result(period, sizing_name="fixed_10_shares", cost=reference_cost,
               slip=reference_slippage):
        return results[(period, sizing_name, cost, slip)]

    lines = [
        "SPY RSI(14) BACKTEST — EXECUTION-AWARE REPORT",
        f"Adjusted daily history: {first_date} through {last_date} "
        f"({len(market):,} trading days).",
        f"70/30 chronological split: development ends "
        f"{market.index[split - 1].strftime('%Y-%m-%d')}; holdout starts "
        f"{split_date}. Settings stayed fixed on both sides.",
        "No RSI parameter search was performed. Every comparison uses the same "
        "saved OHLC dataset and $10,000 initial capital.",
        "",
        "EXECUTION AND COST ASSUMPTIONS",
        "RSI is calculated through today's adjusted Close. A signal is queued at "
        "that close and filled only at the next trading day's Open; if that Open "
        "is missing, the signal is skipped.",
        "All OHLC fields are yfinance auto_adjust=True prices. Buy fill = quoted "
        "Open × (1 + slippage); buy cash debit = shares × buy fill × "
        "(1 + transaction-cost rate). Sell fill = quoted Open or stop quote × "
        "(1 - slippage); net sale proceeds = shares × sell fill × "
        "(1 - transaction-cost rate).",
        "The 5% stop is based on the slippage-adjusted entry fill. If Open gaps "
        "through the stop, exit at that Open; if Open is above the stop and Low "
        "crosses it, assume a stop-level quote, then apply sell slippage and fee. "
        "Daily bars cannot reveal the exact intraday path.",
        "Buy-and-hold buys fractional SPY shares at the period's first Open and "
        "liquidates at the final Close, with the same buy/sell cost and slippage. "
        "Open RSI positions are valued at end-of-day net liquidation value.",
        "Percentage sizing allocates 10%, 25%, or 50% of available cash including "
        "buy costs; fractional shares are permitted. No borrowing or leverage.",
        "Trade statistics use completed round trips and net P&L after both-side "
        "costs. Exposure is the percentage of sessions with shares held at the "
        "close. Missing prices are not filled or fabricated.",
        "",
        "A–H. DECISION REPORT — REFERENCE CASE: FIXED 10 SHARES, "
        "0.05% COST + 0.05% SLIPPAGE PER SIDE",
    ]

    full = result("full_history")
    full_bh = full["benchmark"]
    holdout = result("holdout_30pct")
    holdout_bh = holdout["benchmark"]
    robust_names = [name for name in ("2010-2015", "2016-2020", "2021-2026")
                    if name in periods]
    robust = [(name, result(name)) for name in robust_names]
    robust_beats = sum(
        item["metrics"]["total_return_pct"] > item["benchmark"]["return_pct"]
        for _name, item in robust
    )

    full_net_profitable = full["metrics"]["total_return_pct"] > 0
    holdout_beats = (
        holdout["metrics"]["total_return_pct"] > holdout_bh["return_pct"]
    )
    full_beats = full["metrics"]["total_return_pct"] > full_bh["return_pct"]
    research_more = holdout_beats and robust_beats >= 2

    lines.extend([
        f"A. Realistic execution: RSI net return is "
        f"{format_pct(full['metrics']['total_return_pct'])} over full history and "
        f"{format_pct(holdout['metrics']['total_return_pct'])} on holdout. "
        f"{'It remains positive in absolute terms.' if full_net_profitable else 'It is not profitable in absolute terms.'}",
        f"B. Buy-and-hold: full RSI {format_pct(full['metrics']['total_return_pct'])} "
        f"vs SPY {format_pct(full_bh['return_pct'])} "
        f"({full['metrics']['total_return_pct'] - full_bh['return_pct']:+.2f} pp); "
        f"holdout RSI {format_pct(holdout['metrics']['total_return_pct'])} vs "
        f"SPY {format_pct(holdout_bh['return_pct'])} "
        f"({holdout['metrics']['total_return_pct'] - holdout_bh['return_pct']:+.2f} pp). "
        f"{'It beat the full-period benchmark.' if full_beats else 'It did not beat the full-period benchmark.'}",
        f"C. Market-period consistency: beat buy-and-hold in "
        f"{robust_beats}/{len(robust)} fixed calendar windows.",
        f"D. Evidence volume: {full['metrics']['completed_trades']} completed "
        f"full-history trades; {holdout['metrics']['completed_trades']} on holdout.",
        f"E. Full-history max drawdown: "
        f"{format_pct(full['metrics']['max_drawdown_pct'])}; holdout max drawdown: "
        f"{format_pct(holdout['metrics']['max_drawdown_pct'])}.",
    ])

    if research_more:
        lines.extend([
            "F. Another research direction: Yes, one validation is justified, not "
            "another RSI sweep.",
            "G. Next experiment: freeze RSI(14)/30/70/5% and test the same rules "
            "on a non-overlapping SPY history with realistic next-open fills and "
            "the reference costs; do not retune.",
            "H. Do not connect live trading; require that independent validation "
            "to beat same-cost buy-and-hold first.",
        ])
    else:
        lines.extend([
            "F. Another research direction: No. The fixed RSI rule did not show a "
            "consistent advantage over buy-and-hold under this execution model.",
            "G. Next experiment: None recommended; do not run further RSI threshold "
            "or stop-loss searches on this evidence.",
            "H. Recommendation: abandon RSI(14)/buy<30/sell>70/5% stop as a "
            "buy-and-hold alternative rather than continuing to optimize it. "
            "This is a historical research conclusion, not a live-trading instruction.",
        ])

    lines.extend([
        "",
        "REFERENCE-CASE RESULTS BY PERIOD",
        "Period | RSI return | SPY return | Excess | Annualized | Max DD | "
        "Trades | Win% | Avg win | Avg loss | PF | Loss streak | Exposure",
    ])
    for name in ("full_history", "development_70pct", "holdout_30pct",
                 "2010-2015", "2016-2020", "2021-2026"):
        if name not in periods:
            continue
        item = result(name)
        metrics = item["metrics"]
        benchmark = item["benchmark"]
        lines.append(
            f"{name} | {format_pct(metrics['total_return_pct'])} | "
            f"{format_pct(benchmark['return_pct'])} | "
            f"{metrics['total_return_pct'] - benchmark['return_pct']:+.2f} pp | "
            f"{format_pct(metrics['annualized_return_pct'])} | "
            f"{format_pct(metrics['max_drawdown_pct'])} | "
            f"{metrics['completed_trades']} | {format_pct(metrics['win_rate_pct'])} | "
            f"{fmt_money(metrics['average_winning_trade_usd'])} | "
            f"{fmt_money(metrics['average_losing_trade_usd'])} | "
            f"{fmt_factor(metrics['profit_factor'])} | "
            f"{metrics['largest_losing_streak']} | "
            f"{format_pct(metrics['exposure_pct'])}"
        )

    lines.extend([
        "",
        "COST / SLIPPAGE SENSITIVITY — FULL HISTORY, FIXED 10 SHARES",
        "Cost and slippage rates are per side. Benchmark uses the same rates.",
        "Cost/side | Slippage/side | RSI return | SPY return | Excess | Trades",
    ])
    for cost, slip in (
        (0.0, 0.0),
        (0.0, 0.0005),
        (0.0, 0.001),
        (0.0005, 0.0),
        (0.0005, 0.0005),
        (0.0005, 0.001),
        (0.001, 0.0),
        (0.001, 0.0005),
        (0.001, 0.001),
    ):
        item = result("full_history", cost=cost, slip=slip)
        metrics, benchmark = item["metrics"], item["benchmark"]
        lines.append(
            f"{cost * 100:.2f}% | {slip * 100:.2f}% | "
            f"{format_pct(metrics['total_return_pct'])} | "
            f"{format_pct(benchmark['return_pct'])} | "
            f"{metrics['total_return_pct'] - benchmark['return_pct']:+.2f} pp | "
            f"{metrics['completed_trades']}"
        )

    lines.extend([
        "",
        "POSITION-SIZING SENSITIVITY — FULL HISTORY AND HOLDOUT, "
        "REFERENCE COST/SLIPPAGE",
        "Sizing | Period | RSI return | SPY return | Excess | Max DD | Trades | Exposure",
    ])
    for sizing in SIZING_CONFIGS:
        for name in ("full_history", "holdout_30pct"):
            item = result(name, sizing_name=sizing.name)
            metrics, benchmark = item["metrics"], item["benchmark"]
            lines.append(
                f"{sizing.name} | {name} | "
                f"{format_pct(metrics['total_return_pct'])} | "
                f"{format_pct(benchmark['return_pct'])} | "
                f"{metrics['total_return_pct'] - benchmark['return_pct']:+.2f} pp | "
                f"{format_pct(metrics['max_drawdown_pct'])} | "
                f"{metrics['completed_trades']} | {format_pct(metrics['exposure_pct'])}"
            )

    lines.extend([
        "",
        f"Saved full-precision adjusted OHLC snapshot: {PRICE_SNAPSHOT.name}.",
        "Replay exactly with: uv run python main.py",
        "To fetch the latest available maximum history and replace the snapshot: "
        "uv run python main.py --refresh-data",
        f"Saved the full scenario matrix ({len(results)} period/configuration rows) "
        f"to {RESULTS_PATH.name}.",
    ])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Execution-aware, reproducible SPY RSI backtest."
    )
    parser.add_argument(
        "--refresh-data",
        action="store_true",
        help="Download yfinance period=max adjusted daily history and replace spy_prices.csv.",
    )
    args = parser.parse_args()

    if args.refresh_data or not PRICE_SNAPSHOT.exists():
        print("Downloading maximum available adjusted SPY daily history...")
        downloaded = yf.download(
            "SPY",
            period=DATA_PERIOD,
            interval=DATA_INTERVAL,
            auto_adjust=True,
            progress=False,
            threads=False,
        )
        market = normalize_market_data(downloaded)
        save_snapshot(market)
        source_note = "Downloaded yfinance period=max history and refreshed spy_prices.csv."
    else:
        market = load_snapshot()
        source_note = "Loaded the saved full-precision spy_prices.csv snapshot."

    if len(market) < 100:
        raise RuntimeError(
            f"Only {len(market)} daily rows available; refusing to claim a robust test."
        )

    close_prices = market["Close"].astype(float)
    rsi_values = calculate_rsi(close_prices)
    periods, split = build_periods(market)

    scenarios = []
    for sizing in SIZING_CONFIGS:
        for cost in TRANSACTION_COSTS:
            for slip in SLIPPAGES:
                scenarios.append((sizing, cost, slip))

    results = {}
    csv_rows = []
    for sizing, cost, slip in scenarios:
        for period_name, (start, end) in periods.items():
            metrics = simulate_strategy(
                market,
                rsi_values,
                start,
                end,
                sizing,
                cost,
                slip,
            )
            benchmark = calculate_buy_and_hold(
                market, start, end, cost, slip
            )
            results[(period_name, sizing.name, cost, slip)] = {
                "metrics": metrics,
                "benchmark": benchmark,
            }
            csv_rows.append(
                make_csv_row(
                    period_name,
                    market,
                    start,
                    end,
                    sizing,
                    cost,
                    slip,
                    metrics,
                    benchmark,
                )
            )

    csv_fields = list(csv_rows[0].keys())
    with RESULTS_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=csv_fields)
        writer.writeheader()
        writer.writerows(csv_rows)

    reference_cost = 0.0005
    reference_slippage = 0.0005
    report = build_report(
        market,
        periods,
        split,
        results,
        reference_cost,
        reference_slippage,
    )
    report = report.replace(
        "Saved full-precision adjusted OHLC snapshot: spy_prices.csv.",
        f"Saved full-precision adjusted OHLC snapshot: spy_prices.csv. {source_note}",
    )
    SUMMARY_PATH.write_text(report + "\n", encoding="utf-8")
    print(report)
    print(
        f"\nSaved {RESULTS_PATH.name}, {SUMMARY_PATH.name}, and "
        f"{PRICE_SNAPSHOT.name}."
    )


if __name__ == "__main__":
    main()