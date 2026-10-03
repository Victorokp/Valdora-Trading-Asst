"""Phase-29 test gates.

Gates (specification sections 1, 22, 26, 27):
  1. Golden Reference hash unchanged.
  2. Dataset hash unchanged.
  3. Historical ledger verification still passes (byte-identical regeneration).
  4. Control baseline equals the Golden Reference benchmark exactly.
  5. Pre-registered constants in code match PHASE29_EXPERIMENT_REGISTRY.md.
  6. No favorable-slippage direction anywhere (A-SLIP is adverse-only).
  7. Stochastic experiments use recorded seeds.
  8. Results are deterministic (re-run hashes identical).
  9. Cross-pair FULL results reproduce the historical Phase-23 benchmarks.
 10. Reports exist and reference the control hash.
"""

from __future__ import annotations

import hashlib
import importlib.util
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "phase29"))
sys.path.insert(0, str(ROOT))

GOLDEN_REFERENCE_SHA256 = (
    "b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95"
)
DATASET_SHA256 = (
    "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52"
)
GOLDEN_LEDGER_SHA256 = (
    "30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0"
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_reference():
    spec = importlib.util.spec_from_file_location(
        "p29t_ref", ROOT / "phase21_historical_reference.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class TestPhase29Gates(unittest.TestCase):
    def test_01_golden_reference_hash_unchanged(self):
        self.assertEqual(
            sha256_file(ROOT / "phase21_historical_reference.py"),
            GOLDEN_REFERENCE_SHA256)

    def test_02_dataset_hash_unchanged(self):
        self.assertEqual(sha256_file(ROOT / "eurusd_d.csv"), DATASET_SHA256)

    def test_03_historical_ledger_verification_passes(self):
        import pandas as pd
        ref = load_reference()
        daily = ref.load_daily(ROOT / "eurusd_d.csv", ref.START_DATE)
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
            (daily["Low"] <= daily["EMA20"])
            & (daily["Close"] > daily["EMA20"]))
        daily["confirm"] = daily["Close"] > daily["PrevHigh"]
        daily["signal"] = (daily["weekly_ok"] & daily["daily_trend_ok"]
                           & daily["pullback"] & daily["confirm"])
        daily.loc[: ref.WARMUP - 1, "signal"] = False
        trades = ref.simulate_trades(daily, "signal")
        trades = ref.split_trades(trades, daily)
        tmp = ROOT / "phase29" / "results" / "_gate03_ledger.csv"
        trades.to_csv(tmp, index=False)
        actual = sha256_file(tmp)
        tmp.unlink()
        self.assertEqual(actual, GOLDEN_LEDGER_SHA256,
                         "historical ledger verification failed")

    def test_04_control_baseline_matches_benchmark(self):
        import pandas as pd
        base = pd.read_csv(
            ROOT / "phase29" / "results" / "phase29_control_baseline.csv")
        self.assertEqual(int(base["trades"].iloc[0]), 115)
        self.assertAlmostEqual(float(base["total_R"].iloc[0]), 32.2644,
                               places=4)
        self.assertAlmostEqual(float(base["profit_factor"].iloc[0]), 1.4889,
                               places=4)
        self.assertAlmostEqual(float(base["win_rate_pct"].iloc[0]), 42.6087,
                               places=4)
        self.assertAlmostEqual(float(base["max_drawdown_R"].iloc[0]), -12.0,
                               places=9)
        self.assertEqual(int(base["maximum_losing_streak"].iloc[0]), 7)

    def test_05_preregistered_constants_match_registry(self):
        import phase29_stress as S
        self.assertEqual(S.FRICTION_GRID, [0.0, 1.5, 3.0, 4.0, 5.0, 6.0])
        self.assertEqual(S.SLIP_GRID, [0.5, 1.0, 2.0])
        self.assertEqual(S.DELAY_GRID, [1, 2])
        self.assertEqual(S.EXIT_SLIP_GRID, [0.5, 1.0])
        self.assertEqual(S.STOP_MULTS, [0.9, 1.1])
        self.assertEqual(S.TARGET_MULTS, [1.8, 2.2])
        self.assertEqual(S.EMA_PERTURBS, [
            ("daily", 20, [19, 21]), ("daily", 50, [49, 51]),
            ("weekly", 10, [9, 11]), ("weekly", 20, [19, 21])])
        self.assertEqual(S.F2_SEEDS, [29092601 + i for i in range(20)])
        self.assertEqual(S.F2_RATES, [0.01, 0.05, 0.10])
        self.assertEqual(S.F3_RATES, [0.10, 0.20])
        self.assertEqual(S.G_SEED, 20290926)
        self.assertEqual(S.G_ITERS, 10000)
        self.assertEqual(S.H_CAPS, [3, 2, 1])
        self.assertEqual(S.DD_THRESHOLDS, [5.0, 8.0, 10.0, 12.0, 15.0])
        self.assertEqual(S.REGIME_VOL_BINS, [
            (0.0, 0.005, "low"), (0.005, 0.010, "mid"), (0.010, 1.0, "high")])

    def test_06_no_favorable_slippage(self):
        source = (ROOT / "phase29" / "phase29_stress.py").read_text()
        self.assertNotIn("- entry_slip_pips", source)
        self.assertNotIn("friction - slip", source)
        # target exits may only lose from slippage (subtract, never add)
        self.assertIn("target_price - exit_slip_pips", source)

    def test_07_stochastic_seeds_recorded(self):
        import json
        summary = json.load(open(
            ROOT / "phase29" / "results" / "phase29_summary.json"))
        self.assertEqual(summary["g_order_stress"]["seed"], 20290926)
        self.assertEqual(summary["g_order_stress"]["iterations"], 10000)
        self.assertEqual(summary["i_drawdown"]["mc_envelope"]["seed"],
                         20290926)

    def test_08_determinism(self):
        import json
        import subprocess
        p = ROOT / "phase29" / "results" / "phase29_summary.json"
        before = p.read_bytes()
        r = subprocess.run(
            [sys.executable, str(ROOT / "phase29" / "phase29_stress.py")],
            capture_output=True, text=True, cwd=ROOT, timeout=600)
        self.assertEqual(r.returncode, 0, r.stderr[-2000:])
        self.assertEqual(p.read_bytes(), before)

    def test_09_cross_pair_reproduces_historical_benchmarks(self):
        import pandas as pd
        df = pd.read_csv(
            ROOT / "phase29" / "results" / "PHASE29_STRESS_RESULTS.csv")
        expected = {
            "L-GBPUSD-FULL": (152, 1.044, 4.4012),
            "L-USDJPY-FULL": (118, 1.0649, 5.0),
            "L-AUDUSD-FULL": (123, 0.8944, -8.9756),
        }
        for exp, (trades, pf, total) in expected.items():
            row = df[df["experiment"] == exp].iloc[0]
            self.assertEqual(int(row["trades"]), trades, exp)
            self.assertAlmostEqual(float(row["profit_factor"]), pf,
                                   places=3, msg=exp)
            self.assertAlmostEqual(float(row["total_R"]), total,
                                   places=2, msg=exp)

    def test_10_reports_exist_and_reference_control(self):
        for name in ("PHASE29_SPECIFICATION.md", "PHASE29_ROBUSTNESS_REPORT.md",
                     "PHASE29_DATA_AUDIT.md", "PHASE29_DECISION.md",
                     "PHASE29_STRESS_RESULTS.csv",
                     "PHASE29_EXECUTION_STRESS.csv",
                     "PHASE29_PARAMETER_SENSITIVITY.csv",
                     "PHASE29_DRAWDOWN_STRESS.csv",
                     "PHASE29_TEMPORAL_STRESS.csv",
                     "PHASE29_REGIME_STRESS.csv"):
            self.assertTrue((ROOT / name).exists(), name)
        text = (ROOT / "PHASE29_ROBUSTNESS_REPORT.md").read_text()
        self.assertIn(GOLDEN_REFERENCE_SHA256, text)
        self.assertIn(DATASET_SHA256, text)


if __name__ == "__main__":
    unittest.main()
