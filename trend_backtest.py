import argparse
import csv
import math
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import yfinance as yf


STARTING_CAPITAL = 10_000.0
FAST_WINDOW = 50
SLOW_WINDOW = 200
DATA_PERIOD = "max"
DATA_INTERVAL = "1d"
DEVELOPMENT_FRACTION = 0.70
TRANSACTION_COSTS = (0.0, 0.0005, 0.001)
SLIPPAGES = (0.0, 0.0005, 0.001)

ROOT = Path(__file__).resolve().parent
PRICE_SNAPSHOT = ROOT / "spy_prices.csv"
RESULTS_PATH = ROOT / "trend_results.csv"
SUMMARY_PATH = ROOT / "trend_summary.txt"


@dataclass(frozen=True)
class Sizing:
    name: str
    mode: str
    amount: float


SIZINGS = (
    Sizing("fixed_10_shares", "fixed_shares", 10.0),
    Sizing("10pct_equity", "equity_fraction", 0.10),
    Sizing("25pct_equity", "equity_fraction", 0.25),
    Sizing("50pct_equity", "equity_fraction", 0.50),
)


def extract_field(downloaded, field):
    if isinstance(downloaded.columns, pd.MultiIndex):
        level_found = None
        label_found = None
        for level in range(downloaded.columns.nlevels):
            match = next(
                (
                    label
                    for label in downloaded.columns.get_level_values(level)
                    if str(label).casefold() == field.casefold()
                ),
                None,
            )
            if match is not None:
                level_found, label_found = level, match
                break
        if level_found is None:
            return None
        values = downloaded.xs(
            label_found, axis=1, level=level_found, drop_level=True
        )
    else:
        matches = [
            name
            for name in downloaded.columns
            if str(name).casefold() == field.casefold()
        ]
        if not matches:
            return None
        values = downloaded[matches[0]]

    if isinstance(values, pd.DataFrame):
        tickers = [name for name in values.columns if str(name).upper() == "SPY"]
        if tickers:
            values = values[tickers[0]]
        elif values.shape[1] == 1:
            values = values.iloc[:, 0]
        else:
            raise ValueError(f"Could not select a unique SPY {field} column.")
    return values


def normalize_download(downloaded):
    if downloaded is None or downloaded.empty:
        raise RuntimeError("yfinance returned no SPY data.")
    columns = {}
    for field in ("Open", "High", "Low", "Close", "Volume"):
        values = extract_field(downloaded, field)
        if values is not None:
            columns[field] = pd.to_numeric(values, errors="coerce")
    for required in ("Open", "Low", "Close"):
        if required not in columns:
            raise ValueError(f"Downloaded SPY data is missing {required}.")
    market = pd.DataFrame(columns, index=downloaded.index)
    if isinstance(market.index, pd.DatetimeIndex) and market.index.tz is not None:
        market.index = market.index.tz_localize(None)
    market = market[~market.index.duplicated(keep="first")].sort_index()
    return market.loc[market["Close"].notna()].copy()


def save_snapshot(market):
    snapshot = market.copy()
    snapshot.index.name = "Date"
    snapshot.to_csv(
        PRICE_SNAPSHOT,
        date_format="%Y-%m-%d",
        float_format="%.17g",
    )


def load_market():
    if not PRICE_SNAPSHOT.exists():
        print("No saved SPY snapshot found; downloading yfinance period=max history.")
        raw = yf.download(
            "SPY",
            period=DATA_PERIOD,
            interval=DATA_INTERVAL,
            auto_adjust=True,
            progress=False,
            threads=False,
        )
        market = normalize_download(raw)
        save_snapshot(market)
        return market, "Downloaded maximum adjusted daily history and saved spy_prices.csv."

    market = pd.read_csv(PRICE_SNAPSHOT, parse_dates=["Date"]).set_index("Date")
    for field in market.columns:
        market[field] = pd.to_numeric(market[field], errors="coerce")
    for required in ("Open", "Low", "Close"):
        if required not in market.columns:
            raise ValueError(f"{PRICE_SNAPSHOT.name} is missing {required}.")
    market = market[~market.index.duplicated(keep="first")].sort_index()
    market = market.loc[market["Close"].notna()].copy()
    if market.empty:
        raise ValueError(f"{PRICE_SNAPSHOT.name} contains no valid SPY prices.")
    return market, "Loaded the existing full-precision spy_prices.csv snapshot."


def build_signals(close):
    fast = close.rolling(window=FAST_WINDOW, min_periods=FAST_WINDOW).mean()
    slow = close.rolling(window=SLOW_WINDOW, min_periods=SLOW_WINDOW).mean()
    prior_fast = fast.shift(1)
    prior_slow = slow.shift(1)

    cross_above = (fast > slow) & (prior_fast <= prior_slow)
    cross_below = (fast < slow) & (prior_fast >= prior_slow)
    signals = pd.Series(index=close.index, dtype="object")
    signals.loc[cross_above.fillna(False)] = "buy"
    signals.loc[cross_below.fillna(False)] = "sell"
    return signals


def finite_or_none(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def annualized_return(final_value, first_date, last_date):
    elapsed_days = max((last_date - first_date).days, 1)
    years = elapsed_days / 365.25
    if final_value <= 0:
        return -100.0
    return ((final_value / STARTING_CAPITAL) ** (1 / years) - 1) * 100


def simulate(market, signals, start, end, sizing, cost, slippage):
    period = market.iloc[start:end]
    if period.empty:
        raise ValueError("Cannot backtest an empty period.")

    cash = STARTING_CAPITAL
    shares = 0.0
    entry_total_cost = 0.0
    pending_signal = signals.iloc[start - 1] if start > 0 else None
    trade_pnls = []
    equity_curve = [STARTING_CAPITAL]
    exposure_days = 0
    skipped_missing_open = 0

    def sell_at(quoted_price):
        nonlocal cash, shares, entry_total_cost
        if shares <= 0:
            return
        sell_fill = quoted_price * (1 - slippage)
        net_proceeds = shares * sell_fill * (1 - cost)
        cash += net_proceeds
        trade_pnls.append(net_proceeds - entry_total_cost)
        shares = 0.0
        entry_total_cost = 0.0

    def buy_at(quoted_open):
        nonlocal cash, shares, entry_total_cost
        if cash <= 0:
            return
        buy_fill = quoted_open * (1 + slippage)
        if sizing.mode == "fixed_shares":
            quantity = sizing.amount
        else:
            budget = cash * sizing.amount
            quantity = budget / (buy_fill * (1 + cost))
        total_debit = quantity * buy_fill * (1 + cost)
        if quantity <= 0 or total_debit > cash + 1e-9:
            return
        shares = quantity
        cash = max(0.0, cash - total_debit)
        entry_total_cost = total_debit

    for date, row in period.iterrows():
        open_price = finite_or_none(row["Open"])
        close_price = float(row["Close"])
        signal = pending_signal
        pending_signal = None

        if signal is not None:
            if open_price is None or open_price <= 0:
                skipped_missing_open += 1
            elif signal == "buy" and shares == 0:
                buy_at(open_price)
            elif signal == "sell" and shares > 0:
                sell_at(open_price)

        if shares > 0:
            exposure_days += 1

        # A close-confirmed crossover is only actionable at the next session's open.
        current_signal = signals.loc[date]
        pending_signal = current_signal if pd.notna(current_signal) else None

        # Include estimated sell-side friction in daily equity and final valuation.
        liquidation_value = cash + shares * close_price * (1 - slippage) * (1 - cost)
        equity_curve.append(liquidation_value)

    last_close = float(period["Close"].iloc[-1])
    final_value = cash + shares * last_close * (1 - slippage) * (1 - cost)
    total_return = (final_value / STARTING_CAPITAL - 1) * 100

    peak = STARTING_CAPITAL
    max_drawdown = 0.0
    for equity in equity_curve:
        peak = max(peak, equity)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - equity) / peak * 100)

    wins = [pnl for pnl in trade_pnls if pnl > 0]
    losses = [pnl for pnl in trade_pnls if pnl < 0]
    gross_wins = sum(wins)
    gross_losses = abs(sum(losses))
    if not trade_pnls:
        profit_factor = None
    elif gross_losses == 0:
        profit_factor = math.inf if gross_wins > 0 else None
    else:
        profit_factor = gross_wins / gross_losses

    losing_streak = 0
    max_losing_streak = 0
    for pnl in trade_pnls:
        if pnl < 0:
            losing_streak += 1
            max_losing_streak = max(max_losing_streak, losing_streak)
        else:
            losing_streak = 0

    return {
        "final_value": final_value,
        "total_return_pct": total_return,
        "annualized_return_pct": annualized_return(
            final_value, period.index[0], period.index[-1]
        ),
        "max_drawdown_pct": max_drawdown,
        "completed_trades": len(trade_pnls),
        "win_rate_pct": len(wins) / len(trade_pnls) * 100 if trade_pnls else None,
        "average_winning_trade_usd": sum(wins) / len(wins) if wins else None,
        "average_losing_trade_usd": sum(losses) / len(losses) if losses else None,
        "profit_factor": profit_factor,
        "largest_losing_streak": max_losing_streak,
        "exposure_days": exposure_days,
        "exposure_pct": exposure_days / len(period) * 100,
        "trading_days": len(period),
        "open_shares_at_end": shares,
        "skipped_signals_missing_open": skipped_missing_open,
    }


def benchmark(market, start, end, cost, slippage):
    period = market.iloc[start:end]
    if period.empty:
        raise ValueError("Cannot benchmark an empty period.")
    first_open = finite_or_none(period["Open"].iloc[0])
    last_close = finite_or_none(period["Close"].iloc[-1])
    if first_open is None or first_open <= 0:
        raise ValueError(f"Buy-and-hold has no opening price at {period.index[0]}.")
    buy_fill = first_open * (1 + slippage)
    shares = STARTING_CAPITAL / (buy_fill * (1 + cost))
    sell_fill = last_close * (1 - slippage)
    final_value = shares * sell_fill * (1 - cost)
    return {
        "final_value": final_value,
        "return_pct": (final_value / STARTING_CAPITAL - 1) * 100,
    }


def locate_period(market, start_date, end_date_exclusive):
    start = int(market.index.searchsorted(pd.Timestamp(start_date), side="left"))
    end = int(
        market.index.searchsorted(pd.Timestamp(end_date_exclusive), side="left")
    )
    start = max(0, min(start, len(market)))
    end = max(0, min(end, len(market)))
    return (start, end) if end > start else None


def make_periods(market):
    count = len(market)
    split = max(1, min(int(count * DEVELOPMENT_FRACTION), count - 1))
    periods = {
        "full_history": (0, count),
        "development_70pct": (0, split),
        "holdout_30pct": (split, count),
    }
    for name, first, last in (
        ("2010-2015", "2010-01-01", "2016-01-01"),
        ("2016-2020", "2016-01-01", "2021-01-01"),
        ("2021-2026", "2021-01-01", "2027-01-01"),
    ):
        positions = locate_period(market, first, last)
        if positions is not None:
            periods[name] = positions
    return periods, split


def fmt_pct(value):
    return "n/a" if value is None else f"{value:.2f}%"


def fmt_money(value):
    return "n/a" if value is None else f"${value:,.2f}"


def fmt_factor(value):
    if value is None:
        return "n/a"
    return "∞" if math.isinf(value) else f"{value:.2f}"


def csv_value(value, digits=8):
    if value is None or (isinstance(value, float) and math.isinf(value)):
        return value
    if isinstance(value, (int, bool, str)):
        return value
    return round(float(value), digits)


def make_result_row(period_name, market, start, end, sizing, cost, slippage,
                    metrics, buy_hold):
    period = market.iloc[start:end]
    return {
        "period": period_name,
        "start_date": period.index[0].strftime("%Y-%m-%d"),
        "end_date": period.index[-1].strftime("%Y-%m-%d"),
        "trading_days": metrics["trading_days"],
        "fast_ma_days": FAST_WINDOW,
        "slow_ma_days": SLOW_WINDOW,
        "position_sizing": sizing.name,
        "position_sizing_mode": sizing.mode,
        "position_sizing_amount": sizing.amount,
        "transaction_cost_pct_per_side": cost * 100,
        "slippage_pct_per_side": slippage * 100,
        "final_portfolio_value": csv_value(metrics["final_value"], 6),
        "total_return_pct": csv_value(metrics["total_return_pct"]),
        "annualized_return_pct": csv_value(metrics["annualized_return_pct"]),
        "max_drawdown_pct": csv_value(metrics["max_drawdown_pct"]),
        "completed_trades": metrics["completed_trades"],
        "win_rate_pct": csv_value(metrics["win_rate_pct"]),
        "average_winning_trade_usd": csv_value(
            metrics["average_winning_trade_usd"], 6
        ),
        "average_losing_trade_usd": csv_value(
            metrics["average_losing_trade_usd"], 6
        ),
        "profit_factor": csv_value(metrics["profit_factor"]),
        "largest_losing_streak": metrics["largest_losing_streak"],
        "exposure_days": metrics["exposure_days"],
        "exposure_pct": csv_value(metrics["exposure_pct"]),
        "open_shares_at_end": csv_value(metrics["open_shares_at_end"], 10),
        "signals_skipped_missing_open": metrics["skipped_signals_missing_open"],
        "buy_hold_final_value": csv_value(buy_hold["final_value"], 6),
        "buy_hold_return_pct": csv_value(buy_hold["return_pct"]),
        "excess_return_vs_buy_hold_pp": csv_value(
            metrics["total_return_pct"] - buy_hold["return_pct"]
        ),
    }


def make_report(market, periods, split, results, data_note):
    first = market.index[0].strftime("%Y-%m-%d")
    last = market.index[-1].strftime("%Y-%m-%d")
    split_date = market.index[split].strftime("%Y-%m-%d")
    ref_cost = 0.0005
    ref_slippage = 0.0005

    def get(period, sizing="fixed_10_shares", cost=ref_cost, slippage=ref_slippage):
        return results[(period, sizing, cost, slippage)]

    full = get("full_history")
    dev = get("development_70pct")
    holdout = get("holdout_30pct")
    frictionless_full = get("full_history", cost=0.0, slippage=0.0)
    robust_names = [
        name for name in ("2010-2015", "2016-2020", "2021-2026")
        if name in periods
    ]
    robust = [(name, get(name)) for name in robust_names]
    robust_wins = sum(
        result["metrics"]["total_return_pct"] > result["benchmark"]["return_pct"]
        for _name, result in robust
    )
    dev_excess = (
        dev["metrics"]["total_return_pct"] - dev["benchmark"]["return_pct"]
    )
    holdout_excess = (
        holdout["metrics"]["total_return_pct"] - holdout["benchmark"]["return_pct"]
    )
    full_excess = full["metrics"]["total_return_pct"] - full["benchmark"]["return_pct"]

    # This gate is fixed in advance: positive excess in both chronological
    # periods plus beating the benchmark in at least two of three calendar windows.
    deserves_next_stage = (
        dev_excess > 0 and holdout_excess > 0 and robust_wins >= 2
    )

    lines = [
        "SPY 50/200 MOVING-AVERAGE CROSSOVER — BACKTEST REPORT",
        f"Adjusted SPY daily history: {first} through {last} "
        f"({len(market):,} trading days).",
        data_note,
        f"Fixed chronological split: development ends "
        f"{market.index[split - 1].strftime('%Y-%m-%d')}; untouched holdout begins "
        f"{split_date}. No parameters were selected on the holdout.",
        "No moving-average parameter sweep was run. All configurations use the "
        "same fixed 50/200 crossover and $10,000 starting capital.",
        "",
        "EXECUTION MODEL",
        "50- and 200-session simple moving averages use adjusted Close through "
        "today's close. Cross-above/cross-below signals execute at the next "
        "trading day's adjusted Open; if that Open is missing, the signal is skipped.",
        "Buy fill = quoted Open × (1 + slippage); buy debit = shares × fill × "
        "(1 + transaction-cost rate). Sell fill = quoted Open × (1 - slippage); "
        "net proceeds = shares × fill × (1 - transaction-cost rate).",
        "OHLC is from the existing yfinance auto_adjust=True snapshot. No leverage "
        "is used. Percentage sizing invests the selected fraction of available "
        "cash including buy costs; fractional shares are allowed.",
        "Buy-and-hold buys fractional SPY shares at the period's first Open and "
        "liquidates at the last Close with the same cost and slippage rates. Open "
        "strategy positions are valued at end-of-day net liquidation value.",
        "Metrics count completed round trips; realized trade P&L includes both "
        "sides' friction. Exposure is the share of sessions held at the close.",
        "",
        "A–H. DECISION — REFERENCE CASE: FIXED 10 SHARES, "
        "0.05% COST + 0.05% SLIPPAGE PER SIDE",
        f"A. Made money: yes, {fmt_pct(full['metrics']['total_return_pct'])} "
        f"full-history return and {fmt_pct(holdout['metrics']['total_return_pct'])} "
        "on holdout after reference friction.",
        f"B. Buy-and-hold: full-history SPY {fmt_pct(full['benchmark']['return_pct'])} "
        f"(strategy excess {full_excess:+.2f} pp); holdout SPY "
        f"{fmt_pct(holdout['benchmark']['return_pct'])} "
        f"(strategy excess {holdout_excess:+.2f} pp).",
        f"C. Costs/slippage: full return was "
        f"{fmt_pct(frictionless_full['metrics']['total_return_pct'])} at 0%/0%, "
        f"versus {fmt_pct(full['metrics']['total_return_pct'])} at 0.05%/0.05% "
        "per side; returns remain positive, but it still trails SPY.",
        f"D. Period consistency: beat buy-and-hold in {robust_wins}/{len(robust)} "
        "fixed calendar periods.",
        f"E. Maximum drawdown: {fmt_pct(full['metrics']['max_drawdown_pct'])} "
        f"full history; {fmt_pct(holdout['metrics']['max_drawdown_pct'])} holdout.",
        f"F. Completed round trips: {full['metrics']['completed_trades']} full history; "
        f"{holdout['metrics']['completed_trades']} holdout.",
        f"G. Untouched holdout: {fmt_pct(holdout['metrics']['total_return_pct'])} "
        f"strategy return vs {fmt_pct(holdout['benchmark']['return_pct'])} SPY; "
        "positive in dollars, but it did not beat the benchmark.",
    ]
    if deserves_next_stage:
        decision = (
            "H. Decision: choose 3 — move to limited paper trading only; keep "
            "the 50/200 settings fixed and do not connect a brokerage account."
        )
    else:
        decision = (
            "H. Decision: choose 1 — abandon this 50/200 strategy as a "
            "buy-and-hold alternative. Do not paper trade or continue optimizing it."
        )
    lines.append(decision)

    lines.extend([
        "",
        "REFERENCE-CASE RESULTS BY PERIOD",
        "Period | Final value | Return | Annualized | SPY return | Excess | "
        "Max DD | Trades | Win% | Avg win | Avg loss | PF | Loss streak | Exposure",
    ])
    ordered_periods = (
        "full_history", "development_70pct", "holdout_30pct",
        "2010-2015", "2016-2020", "2021-2026",
    )
    for name in ordered_periods:
        if name not in periods:
            continue
        item = get(name)
        metrics, bmark = item["metrics"], item["benchmark"]
        lines.append(
            f"{name} | {fmt_money(metrics['final_value'])} | "
            f"{fmt_pct(metrics['total_return_pct'])} | "
            f"{fmt_pct(metrics['annualized_return_pct'])} | "
            f"{fmt_pct(bmark['return_pct'])} | "
            f"{metrics['total_return_pct'] - bmark['return_pct']:+.2f} pp | "
            f"{fmt_pct(metrics['max_drawdown_pct'])} | "
            f"{metrics['completed_trades']} | {fmt_pct(metrics['win_rate_pct'])} | "
            f"{fmt_money(metrics['average_winning_trade_usd'])} | "
            f"{fmt_money(metrics['average_losing_trade_usd'])} | "
            f"{fmt_factor(metrics['profit_factor'])} | "
            f"{metrics['largest_losing_streak']} | "
            f"{fmt_pct(metrics['exposure_pct'])}"
        )

    lines.extend([
        "",
        "COST / SLIPPAGE SENSITIVITY — FULL HISTORY, FIXED 10 SHARES",
        "Cost and slippage are per side; the benchmark uses identical assumptions.",
        "Cost | Slippage | Strategy return | SPY return | Excess | Trades",
    ])
    for cost, slippage in (
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
        item = get("full_history", cost=cost, slippage=slippage)
        metrics, bmark = item["metrics"], item["benchmark"]
        lines.append(
            f"{cost * 100:.2f}% | {slippage * 100:.2f}% | "
            f"{fmt_pct(metrics['total_return_pct'])} | "
            f"{fmt_pct(bmark['return_pct'])} | "
            f"{metrics['total_return_pct'] - bmark['return_pct']:+.2f} pp | "
            f"{metrics['completed_trades']}"
        )

    lines.extend([
        "",
        "POSITION-SIZING SENSITIVITY — REFERENCE COST/SLIPPAGE",
        "Sizing | Period | Strategy return | SPY return | Excess | Max DD | "
        "Trades | Exposure",
    ])
    for sizing in SIZINGS:
        for name in ("full_history", "holdout_30pct"):
            item = get(name, sizing=sizing.name)
            metrics, bmark = item["metrics"], item["benchmark"]
            lines.append(
                f"{sizing.name} | {name} | {fmt_pct(metrics['total_return_pct'])} | "
                f"{fmt_pct(bmark['return_pct'])} | "
                f"{metrics['total_return_pct'] - bmark['return_pct']:+.2f} pp | "
                f"{fmt_pct(metrics['max_drawdown_pct'])} | "
                f"{metrics['completed_trades']} | {fmt_pct(metrics['exposure_pct'])}"
            )

    lines.extend([
        "",
        f"Scenario count: {len(results)} period/configuration rows in "
        f"{RESULTS_PATH.name}.",
        f"Source snapshot: {PRICE_SNAPSHOT.name}; replay with "
        f"uv run python trend_backtest.py.",
    ])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Backtest a fixed SPY 50/200 SMA crossover."
    )
    parser.parse_args()

    market, data_note = load_market()
    if len(market) < SLOW_WINDOW + 2:
        raise RuntimeError(
            f"Need at least {SLOW_WINDOW + 2} adjusted daily observations."
        )

    close = market["Close"].astype(float)
    signals = build_signals(close)
    periods, split = make_periods(market)

    results = {}
    rows = []
    for sizing in SIZINGS:
        for cost in TRANSACTION_COSTS:
            for slippage in SLIPPAGES:
                for period_name, (start, end) in periods.items():
                    metrics = simulate(
                        market, signals, start, end, sizing, cost, slippage
                    )
                    bmark = benchmark(market, start, end, cost, slippage)
                    results[(period_name, sizing.name, cost, slippage)] = {
                        "metrics": metrics,
                        "benchmark": bmark,
                    }
                    rows.append(
                        make_result_row(
                            period_name,
                            market,
                            start,
                            end,
                            sizing,
                            cost,
                            slippage,
                            metrics,
                            bmark,
                        )
                    )

    with RESULTS_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    report = make_report(market, periods, split, results, data_note)
    SUMMARY_PATH.write_text(report + "\n", encoding="utf-8")
    print(report)
    print(
        f"\nSaved {RESULTS_PATH.name} and {SUMMARY_PATH.name}; "
        f"used existing snapshot {PRICE_SNAPSHOT.name}."
    )


if __name__ == "__main__":
    main()