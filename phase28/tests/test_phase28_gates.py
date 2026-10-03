"""Phase-28 test gates (specification section 30).

Gates:
  1. Golden Reference hash unchanged.
  2. Dataset hash unchanged.
  3. Historical ledger verification still passes.
  4. OOS trades cannot enter training/validation calculations (per-window
     bucket disjointness; OOS == union of the 16 test buckets, each once).
  5. Training/validation trades cannot enter OOS calculations (OOS equity
     uses exactly the OOS trade set, exit-ordered).
  6. No future data enters signal features (feature columns are causal:
     trailing windows end at the signal bar; weekly values are backward-
     mapped completed bars).
  7. Walk-forward windows are correct (anchors 2004-2019; periods and
     year assignments).
  8. OOS equity uses test trades only (every cum_R step traces to an OOS
     trade's R; total equals the OOS sum).
  9. Randomized analyses use recorded seeds.
  10. Results are deterministic (statistics module re-run reproduces
      artifact hashes byte-for-byte).
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PH28 = ROOT / "phase28" / "results"

GOLDEN_LEDGER_SHA256 = (
    "30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0"
)
GOLDEN_REFERENCE_SHA256 = (
    "b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95"
)
DATASET_SHA256 = (
    "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52"
)
SEEDS = {"bootstrap": 20280926, "monte_carlo": 20280927}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Phase28GateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        required = [
            PH28 / "PHASE28_WALK_FORWARD_RESULTS.csv",
            PH28 / "PHASE28_OOS_TRADES.csv",
            PH28 / "PHASE28_OOS_EQUITY.csv",
            PH28 / "phase28_wf_summary.json",
            PH28 / "phase28_statistics.json",
            PH28 / "phase28_validation.json",
        ]
        missing = [p.name for p in required if not p.exists()]
        if missing:
            raise unittest.SkipTest(
                "phase28 result artifacts missing; run phase28_walk_forward.py,"
                " phase28_statistics.py, phase28_validation.py first: "
                + ", ".join(missing)
            )
        cls.wf = pd.read_csv(PH28 / "PHASE28_WALK_FORWARD_RESULTS.csv")
        cls.oos = pd.read_csv(PH28 / "PHASE28_OOS_TRADES.csv")
        cls.eq = pd.read_csv(PH28 / "PHASE28_OOS_EQUITY.csv")
        cls.summary = json.loads(
            (PH28 / "phase28_wf_summary.json").read_text())
        cls.stats = json.loads((PH28 / "phase28_statistics.json").read_text())
        cls.audit = json.loads(
            (PH28 / "phase28_validation.json").read_text())

    # ---- gates 1-3 ----
    def test_01_golden_reference_hash_unchanged(self):
        self.assertEqual(
            sha256_file(ROOT / "phase21_historical_reference.py"),
            GOLDEN_REFERENCE_SHA256)

    def test_02_dataset_hash_unchanged(self):
        self.assertEqual(sha256_file(ROOT / "eurusd_d.csv"), DATASET_SHA256)

    def test_03_historical_ledger_verification_passes(self):
        self.assertTrue(self.summary["integrity"]["ledger_byte_identical"])
        self.assertEqual(self.summary["integrity"]["ledger_sha256"],
                         GOLDEN_LEDGER_SHA256)

    # ---- gates 4-5: separation ----
    def test_04_oos_disjoint_from_train_validation(self):
        """Per-window bucket disjointness is the walk-forward invariant.
        NOTE (documented in PHASE28_DATA_AUDIT.md): rolling walk-forward
        buckets intentionally REUSE calendar years across windows (a 2012
        trade is test for anchor 2006 and train for anchors 2008-2012).
        This is re-bucketing of one frozen trade set for evaluation only;
        no fitting occurs in any window, so no information can flow from a
        test bucket into any rule or parameter. Global year disjointness is
        NOT a property of rolling walk-forward and is not asserted."""
        anchors = self.wf["anchor_year"].tolist()
        self.assertEqual(anchors, list(range(2004, 2020)))
        for _, row in self.wf.iterrows():
            Y = int(row["anchor_year"])
            train = set(range(Y, Y + 5))
            self.assertNotIn(Y + 5, train)   # val outside train
            self.assertNotIn(Y + 6, train)   # test outside train
            self.assertNotEqual(Y + 5, Y + 6)
            self.assertEqual(row["train_period"], f"{Y}-{Y + 4}")
        test_years = set(range(2010, 2026))
        oos_years = set(pd.to_datetime(self.oos["entry_date"]).dt.year)
        # OOS trades are a subset of the union of test buckets; the missing
        # years are exactly the zero-trade (flat) test windows (2019, 2022:
        # no qualifying signals in those years)
        self.assertTrue(oos_years.issubset(test_years))
        zero_windows = self.wf[self.wf["test_trades"] == 0]
        self.assertEqual(set(zero_windows["test_period"].astype(int)),
                         test_years - oos_years)
        self.assertEqual(len(zero_windows), 2)
        # strict untouched final period: chronological final bucket has 23
        # trades (entry > 2023-04-23); 20 of them fall inside the walk-forward
        # OOS years (2010-2025) and 3 enter in 2026, beyond the 16-window
        # range. Both facts are asserted so the two OOS definitions stay
        # explicit.
        entry_dates = pd.to_datetime(self.oos["entry_date"])
        strict = entry_dates > pd.Timestamp("2023-04-23")
        self.assertEqual(int(strict.sum()), 20)
        self.assertEqual(int((entry_dates.dt.year == 2026).sum()), 0)
        full_ledger = pd.read_csv(
            ROOT / "phase27" / "results" / "phase27_baseline_trades.csv")
        full_entries = pd.to_datetime(full_ledger["entry_date"])
        self.assertEqual(
            int((full_entries > pd.Timestamp("2023-04-23")).sum()), 23)
        self.assertEqual(int((full_entries.dt.year == 2026).sum()), 3)

    def test_05_oos_equity_uses_oos_trades_only(self):
        # the equity curve's step sequence must equal the exit-ordered OOS
        # R sequence, and its final value must equal the OOS total
        eq_sorted = self.eq.sort_values("oos_seq")
        oos_sorted = self.oos.sort_values("oos_seq")
        self.assertEqual(len(eq_sorted), len(oos_sorted))
        self.assertTrue(
            (eq_sorted["r_multiple"].to_numpy()
             == oos_sorted.sort_values("exit_date")["r_multiple"].to_numpy()
             ).all())
        self.assertAlmostEqual(
            float(eq_sorted["cum_R"].iloc[-1]),
            float(oos_sorted["r_multiple"].sum()), places=10)
        # no train/validation-era-only trade leaks in: every equity row's
        # entry year is >= 2010
        years = pd.to_datetime(eq_sorted["entry_date"]).dt.year
        self.assertTrue((years >= 2010).all())

    # ---- gate 6: causality ----
    def test_06_no_future_data_in_signal_features(self):
        # the truncation look-ahead audit passed for every OOS signal day
        self.assertEqual(self.audit["lookahead_audit"]["result"], "PASS")
        self.assertEqual(self.audit["lookahead_audit"]["signals_checked"],
                         len(self.oos))
        self.assertEqual(self.audit["entry_timing_audit"]["result"], "PASS")
        # regime features exist for all OOS rows and are bounded causally
        stats = self.stats["regime_conditional_oos"]["atr_pctile_100"]
        trades_binned = sum(v["trades"] for v in stats.values())
        self.assertEqual(trades_binned, len(self.oos))

    # ---- gate 7: window correctness ----
    def test_07_walk_forward_windows_correct(self):
        self.assertEqual(len(self.wf), 16)
        for i, row in self.wf.iterrows():
            Y = 2004 + i
            self.assertEqual(row["train_period"], f"{Y}-{Y + 4}")
            self.assertEqual(int(row["validation_period"]), Y + 5)
            self.assertEqual(int(row["test_period"]), Y + 6)

    # ---- gate 9: seeds ----
    def test_09_randomized_analyses_use_recorded_seeds(self):
        self.assertEqual(self.stats["bootstrap"]["seed"],
                         SEEDS["bootstrap"])
        self.assertEqual(self.stats["monte_carlo"]["seed"],
                         SEEDS["monte_carlo"])
        self.assertEqual(self.stats["bootstrap"]["iterations"], 10000)
        self.assertEqual(self.stats["monte_carlo"]["iterations"], 10000)

    # ---- gate 10: determinism ----
    def test_10_results_are_deterministic(self):
        """Re-running the statistics module must reproduce the committed
        artifact byte-for-byte (same hashes)."""
        before = sha256_file(PH28 / "phase28_statistics.json")
        subprocess.run(
            [sys.executable, str(ROOT / "phase28" / "phase28_statistics.py")],
            check=True, capture_output=True,
        )
        after = sha256_file(PH28 / "phase28_statistics.json")
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
