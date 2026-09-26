from __future__ import annotations

import builtins
import unittest
import unittest.mock
from pathlib import Path

import numpy as np
import pandas as pd

import phase21_reconstruction as p21


def bars(
    opens: list[float],
    highs: list[float],
    lows: list[float],
    closes: list[float],
    atrs: list[float],
    signals: list[bool],
) -> pd.DataFrame:
    dates = pd.date_range("2020-01-01", periods=len(opens), freq="D")
    return pd.DataFrame(
        {
            "Open": opens,
            "High": highs,
            "Low": lows,
            "Close": closes,
            "ATR14": atrs,
            "Signal": signals,
        },
        index=dates,
    )


class Phase21MechanicsTests(unittest.TestCase):
    def test_ema_uses_adjust_false_span_convention(self) -> None:
        frame = pd.DataFrame(
            {
                "Open": [1, 2, 3, 4],
                "High": [1, 2, 3, 4],
                "Low": [1, 2, 3, 4],
                "Close": [1.0, 2.0, 1.0, 3.0],
            },
            index=pd.date_range("2020-01-01", periods=4),
        )
        result = p21.add_indicators(frame)
        expected = frame["Close"].ewm(span=20, adjust=False).mean()
        pd.testing.assert_series_equal(
            result["EMA20"],
            expected,
            check_names=False,
            check_freq=False,
        )

    def test_wilder_atr_uses_alpha_adjust_false_and_min_periods(self) -> None:
        frame = pd.DataFrame(
            {
                "High": [11.0, 13.0, 14.0, 16.0],
                "Low": [9.0, 10.0, 12.0, 13.0],
                "Close": [10.0, 12.0, 13.0, 15.0],
            },
            index=pd.date_range("2020-01-01", periods=4),
        )
        previous = frame["Close"].shift(1)
        true_range = pd.concat(
            [
                frame["High"] - frame["Low"],
                (frame["High"] - previous).abs(),
                (frame["Low"] - previous).abs(),
            ],
            axis=1,
        ).max(axis=1)
        expected = true_range.ewm(
            alpha=1 / 3, adjust=False, min_periods=3
        ).mean()
        actual = p21.wilder_atr(frame, period=3)
        pd.testing.assert_series_equal(actual, expected, check_names=False)

    def test_weekly_alignment_is_backward_and_allows_exact_friday(self) -> None:
        dates = pd.to_datetime(
            ["2020-01-02", "2020-01-03", "2020-01-06", "2020-01-10"]
        )
        frame = pd.DataFrame(
            {
                "Open": [1.0, 2.0, 3.0, 4.0],
                "High": [1.5, 2.5, 3.5, 4.5],
                "Low": [0.5, 1.5, 2.5, 3.5],
                "Close": [1.0, 2.0, 3.0, 4.0],
            },
            index=dates,
        )
        result = p21.add_indicators(frame)
        self.assertEqual(
            result.loc[pd.Timestamp("2020-01-06"), "WeeklyEMA10"],
            result.loc[pd.Timestamp("2020-01-03"), "WeeklyEMA10"],
        )
        self.assertAlmostEqual(
            result.loc[pd.Timestamp("2020-01-10"), "WeeklyEMA10"],
            2.0 + (4.0 - 2.0) * (2.0 / 11.0),
        )
        self.assertEqual(
            result.loc[pd.Timestamp("2020-01-10"), "WeeklyRegime"],
            True,
        )

    def test_signal_requires_every_unambiguous_condition(self) -> None:
        index = pd.date_range("2020-01-01", periods=3)
        frame = pd.DataFrame(
            {
                "WeeklyRegime": [True, True, True],
                "EMA20": [10.0, 10.0, 10.0],
                "EMA50": [9.0, 9.0, 9.0],
                "Low": [9.0, 9.0, 9.0],
                "Close": [11.0, 11.0, 11.0],
                "High": [10.0, 10.0, 10.0],
            },
            index=index,
        )
        frame["EMA50"] = [8.0, 8.5, 9.0]
        self.assertTrue(p21.build_signals(frame).iloc[1])
        frame.loc[index[1], "Close"] = 10.0
        self.assertFalse(p21.build_signals(frame).iloc[1])

    def test_next_day_entry_friction_stop_target_and_dataset_end_close(self) -> None:
        frame = bars(
            [100.0, 101.0, 102.0],
            [100.0, 101.0, 103.0],
            [100.0, 100.5, 101.5],
            [100.0, 101.0, 102.0],
            [1.0, 1.0, 1.0],
            [True, False, False],
        )
        trades = p21.simulate_trades(frame, "EURUSD")
        self.assertEqual(len(trades), 1)
        trade = trades.iloc[0]
        self.assertEqual(trade["entry_date"], "2020-01-02")
        self.assertAlmostEqual(trade["raw_entry"], 101.0)
        self.assertAlmostEqual(trade["entry"], 101.00015)
        self.assertAlmostEqual(trade["friction"], 0.00015)
        self.assertAlmostEqual(trade["stop"], 100.00015)
        self.assertAlmostEqual(trade["target"], 103.00015)
        self.assertEqual(trade["exit_reason"], "dataset_end_close")
        self.assertEqual(trade["open_at_end"], 1)

    def test_gap_stop_fills_at_open(self) -> None:
        frame = bars(
            [100.0, 101.0, 98.0],
            [100.0, 101.0, 99.0],
            [100.0, 100.5, 97.0],
            [100.0, 101.0, 98.0],
            [1.0, 1.0, 1.0],
            [True, False, False],
        )
        trade = p21.simulate_trades(frame, "EURUSD").iloc[0]
        self.assertEqual(trade["exit_reason"], "gap_stop")
        self.assertAlmostEqual(trade["exit"], 98.0)

    def test_gap_target_fills_at_open(self) -> None:
        frame = bars(
            [100.0, 101.0, 104.0],
            [100.0, 101.0, 105.0],
            [100.0, 100.5, 103.0],
            [100.0, 101.0, 104.0],
            [1.0, 1.0, 1.0],
            [True, False, False],
        )
        trade = p21.simulate_trades(frame, "EURUSD").iloc[0]
        self.assertEqual(trade["exit_reason"], "gap_target")
        self.assertAlmostEqual(trade["exit"], 104.0)

    def test_same_candle_stop_first(self) -> None:
        frame = bars(
            [100.0, 101.0],
            [100.0, 104.5],
            [100.0, 99.0],
            [100.0, 101.0],
            [1.0, 1.0],
            [True, False],
        )
        trade = p21.simulate_trades(frame, "EURUSD").iloc[0]
        self.assertEqual(trade["exit_reason"], "same_candle_stop_first")
        self.assertAlmostEqual(trade["exit"], trade["stop"])

    def test_no_overlapping_positions(self) -> None:
        frame = bars(
            [100.0, 101.0, 102.0, 103.0],
            [100.0, 101.5, 102.5, 105.5],
            [100.0, 100.5, 101.5, 102.5],
            [100.0, 101.0, 102.0, 105.0],
            [1.0, 1.0, 1.0, 1.0],
            [True, True, False, False],
        )
        trades = p21.simulate_trades(frame, "EURUSD")
        self.assertEqual(len(trades), 1)
        self.assertEqual(trades.iloc[0]["entry_date"], "2020-01-02")

    def test_only_long_signal_path_is_available(self) -> None:
        frame = bars(
            [100.0, 101.0],
            [100.0, 102.0],
            [100.0, 99.0],
            [100.0, 101.0],
            [1.0, 1.0],
            [False, False],
        )
        trades = p21.simulate_trades(frame, "EURUSD")
        self.assertTrue(trades.empty)
        self.assertTrue(np.isnan(float("nan")))

    def test_csv_loader_preserves_ohlc_values(self) -> None:
        """Regression: CSV columns must not be aligned against the DatetimeIndex.

        The loader builds a DatetimeIndex from the Date column while the source
        frame still carries a RangeIndex. Constructing the frame from raw pandas
        Series silently aligns those indexes and produces all-NaN OHLC columns.
        The loader must build columns positionally.
        """
        with unittest.mock.patch.object(
            builtins, "open", unittest.mock.mock_open(
                read_data=(
                    "Date,Open,High,Low,Close\n"
                    "2024-01-01,1.0,1.1,0.9,1.05\n"
                    "2024-01-02,1.05,1.2,1.0,1.15\n"
                )
            )
        ):
            frame, audit = p21.load_ohlc_csv(Path("mock.csv"))
        self.assertEqual(len(frame), 2)
        self.assertEqual(audit["normalized_rows"], 2)
        self.assertEqual(audit["rows_with_missing_ohlc"], 0)
        self.assertEqual(audit["first_date"], "2024-01-01")
        self.assertEqual(audit["last_date"], "2024-01-02")
        self.assertAlmostEqual(float(frame["Close"].iloc[0]), 1.05)
        self.assertAlmostEqual(float(frame["Close"].iloc[1]), 1.15)

    def test_eurusd_maps_to_authoritative_eurusd_d_csv(self) -> None:
        """Phase-21 must read the authoritative eurusd_d.csv dataset."""
        self.assertEqual(p21.PAIR_FILES["EURUSD"], ("eurusd_d.csv",))


if __name__ == "__main__":
    unittest.main()