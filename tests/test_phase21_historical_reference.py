"""Phase-21 GOLDEN REFERENCE verification (closure gate).

Regenerates the historical Phase-21 EUR/USD ledger by executing
``phase21_historical_reference.py`` (imported as a module; the file itself is
never modified) against the authoritative ``eurusd_d.csv``, then requires the
regenerated ledger to be BYTE-FOR-BYTE identical to the historical 115-row
artifact, verified by SHA-256.

A matching summary statistic (trade count / PF / total R) is NOT sufficient
by design: this test fails loudly unless the whole-file SHA-256 matches.

Expected ledger SHA-256 (recorded in the verification metadata below and in
PHASE21_CLOSURE_REPORT.md):
    30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0
Historical reference artifact: the ``historical_phase21_forensic_package``
zip committed at 79f8681 -> output/phase21_trades_ledger.csv (115 rows).
"""

from __future__ import annotations

import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_MODULE = ROOT / "phase21_historical_reference.py"
AUTHORITATIVE_DATASET = ROOT / "eurusd_d.csv"

EXPECTED_LEDGER_SHA256 = (
    "30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0"
)
EXPECTED_LEDGER_ROWS = 115

# Summary statistics of the historical benchmark, checked as a secondary gate.
EXPECTED_SUMMARY = {
    "trades": 115,
    "win_rate_pct": 42.6,
    "profit_factor": 1.49,
    "total_R": 32.26,
    "max_drawdown_R": -12.00,
}


def _load_reference_module():
    spec = importlib.util.spec_from_file_location(
        "phase21_historical_reference", REFERENCE_MODULE
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Phase21GoldenReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not REFERENCE_MODULE.exists():
            raise unittest.SkipTest(
                "phase21_historical_reference.py is not present; run on the "
                "reference branch."
            )
        cls.ref = _load_reference_module()
        cls.out_dir = ROOT / "phase21_experiment_results"
        cls.out_dir.mkdir(exist_ok=True)

    def test_01_regenerated_ledger_is_byte_identical(self) -> None:
        """Rebuild the ledger from the Golden Reference and require the
        whole-file SHA-256 to equal the historical artifact's hash."""
        daily = self.ref.load_daily(AUTHORITATIVE_DATASET, self.ref.START_DATE)
        daily["EMA20"] = self.ref.ema(daily["Close"], 20)
        daily["EMA50"] = self.ref.ema(daily["Close"], 50)
        daily["EMA50_rising"] = daily["EMA50"] > daily["EMA50"].shift(5)
        daily["ATR"] = self.ref.atr(daily, 14)
        daily["PrevHigh"] = daily["High"].shift(1)
        weekly_ok = self.ref.build_weekly_filter(daily)
        daily["weekly_ok"] = self.ref.map_weekly_to_daily(daily, weekly_ok)
        daily["daily_trend_ok"] = (
            (daily["EMA20"] > daily["EMA50"]) & daily["EMA50_rising"]
        )
        daily["pullback"] = (
            (daily["Low"] <= daily["EMA20"]) & (daily["Close"] > daily["EMA20"])
        )
        daily["confirm"] = daily["Close"] > daily["PrevHigh"]
        daily["signal"] = (
            daily["weekly_ok"]
            & daily["daily_trend_ok"]
            & daily["pullback"]
            & daily["confirm"]
        )
        daily.loc[: self.ref.WARMUP - 1, "signal"] = False

        trades = self.ref.simulate_trades(daily, "signal")
        trades = self.ref.split_trades(trades, daily)

        ledger_path = self.out_dir / "phase21_trades.csv"
        trades.to_csv(ledger_path, index=False)

        actual_sha = _sha256_file(ledger_path)
        self.assertEqual(
            len(trades),
            EXPECTED_LEDGER_ROWS,
            f"ledger row count changed: {len(trades)} != {EXPECTED_LEDGER_ROWS}",
        )
        self.assertEqual(
            actual_sha,
            EXPECTED_LEDGER_SHA256,
            "GOLDEN REFERENCE BROKEN: regenerated ledger SHA-256 "
            f"{actual_sha} != historical {EXPECTED_LEDGER_SHA256}. The "
            "ledger is no longer byte-identical to the historical 115-row "
            "artifact.",
        )

    def test_02_summary_statistics_match_benchmark(self) -> None:
        """Secondary gate: headline statistics of the regenerated ledger."""
        ledger_path = self.out_dir / "phase21_trades.csv"
        self.assertTrue(ledger_path.exists())
        trades = pd.read_csv(ledger_path)
        resolved = trades[trades["outcome"] != "open_at_data_end"]
        wins = resolved[resolved["r_multiple"] > 0]
        losses = resolved[resolved["r_multiple"] <= 0]
        gross_win = float(wins["r_multiple"].sum())
        gross_loss = float(-losses["r_multiple"].sum())
        pf = gross_win / gross_loss if gross_loss > 0 else float("inf")
        ordered = resolved.sort_values("exit_date")
        cum = ordered["r_multiple"].cumsum()
        max_dd = float((cum - cum.cummax()).min())

        checks = {
            "trades": len(trades),
            "win_rate_pct": round(len(wins) / len(resolved) * 100.0, 1),
            "profit_factor": round(pf, 2),
            "total_R": round(float(ordered["r_multiple"].sum()), 2),
            "max_drawdown_R": round(max_dd, 2),
        }
        self.assertEqual(checks, EXPECTED_SUMMARY)

    def test_03_reference_module_is_frozen_byte_copy(self) -> None:
        """The Golden Reference must remain the byte-identical copy of the
        reconciliation experiment module."""
        experiment = ROOT / "phase21_reconciliation_experiment.py"
        if not experiment.exists():
            self.skipTest("experiment module not present on this branch")
        self.assertEqual(
            _sha256_file(REFERENCE_MODULE),
            _sha256_file(experiment),
            "phase21_historical_reference.py diverged from "
            "phase21_reconciliation_experiment.py; behavior drift detected.",
        )


if __name__ == "__main__":
    unittest.main()
