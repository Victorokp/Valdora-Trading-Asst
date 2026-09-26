"""Phase-27 reproducibility and gate-integrity tests.

Verifies, from the committed artifacts:
  1. the Phase-27 baseline ledger is byte-identical to the historical
     Golden Reference ledger (SHA-256);
  2. Golden Reference and dataset files are unchanged;
  3. the diagnostics artifact records byte-identity and the pre-registered
     27-I seed, and contains the full 16-window walk-forward;
  4. the experiments artifact: exactly the pre-registered candidates exist,
     gate decisions are mechanically correct against the recorded gate
     constants, and final-period evaluation exists ONLY for frozen
     candidates (contamination guard).
"""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PH27 = ROOT / "phase27" / "results"

GOLDEN_LEDGER_SHA256 = (
    "30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0"
)
GOLDEN_REFERENCE_SHA256 = (
    "b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95"
)
DATASET_SHA256 = (
    "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52"
)
REGISTERED_CANDIDATES = {
    "C1_concurrency_cap_1",
    "C2_weekly_separation_floor",
    "C3_vol_percentile_floor",
    "C4_concurrency_cap_2",
    "C5_quality_combo",
}
SEED_27I = 20260926


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Phase27ReproducibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        required = [
            PH27 / "phase27_baseline_trades.csv",
            PH27 / "phase27_enriched_trades.csv",
            PH27 / "phase27_baseline_summary.json",
            PH27 / "phase27_diagnostics.json",
            PH27 / "phase27_experiments.json",
        ]
        missing = [p.name for p in required if not p.exists()]
        if missing:
            raise unittest.SkipTest(
                "phase27 result artifacts missing (run phase27_baseline.py, "
                "phase27_diagnostics.py, phase27_experiments.py): "
                + ", ".join(missing)
            )
        cls.baseline = json.loads(
            (PH27 / "phase27_baseline_summary.json").read_text()
        )
        cls.diagnostics = json.loads(
            (PH27 / "phase27_diagnostics.json").read_text()
        )
        cls.experiments = json.loads(
            (PH27 / "phase27_experiments.json").read_text()
        )

    def test_01_baseline_ledger_is_byte_identical_to_golden(self):
        self.assertEqual(
            sha256_file(PH27 / "phase27_baseline_trades.csv"),
            GOLDEN_LEDGER_SHA256,
        )
        self.assertTrue(self.baseline["ledger_byte_identical"])

    def test_02_golden_reference_and_dataset_unchanged(self):
        self.assertEqual(
            sha256_file(ROOT / "phase21_historical_reference.py"),
            GOLDEN_REFERENCE_SHA256,
        )
        self.assertEqual(sha256_file(ROOT / "eurusd_d.csv"), DATASET_SHA256)
        self.assertEqual(
            self.baseline["golden_reference_sha256"],
            GOLDEN_REFERENCE_SHA256,
        )
        self.assertEqual(self.baseline["dataset_sha256"], DATASET_SHA256)

    def test_03_diagnostics_integrity(self):
        integrity = self.diagnostics["integrity"]
        self.assertTrue(integrity["ledger_byte_identical"])
        self.assertEqual(integrity["seed_27i"], SEED_27I)
        wf = self.diagnostics["J_walkforward_descriptive"]["windows"]
        self.assertEqual(len(wf), 16)
        self.assertEqual(wf[0]["anchor"], 2004)
        self.assertEqual(wf[-1]["anchor"], 2019)

    def test_04_candidate_set_matches_registry(self):
        self.assertEqual(
            set(self.experiments["candidates"].keys()),
            REGISTERED_CANDIDATES,
        )

    def test_05_gate_decisions_are_mechanical(self):
        gates_cfg = self.experiments["gate_constants"]
        for cid, cand in self.experiments["candidates"].items():
            train_R = cand["train"]["total_R"]
            val_R = cand["validation"]["total_R"]
            val_n = cand["validation"]["trades"]
            expected_b = (
                val_R > gates_cfg["GATE_VAL_MIN_R"]
                and val_n >= gates_cfg["GATE_VAL_MIN_TRADES"]
                and train_R >= gates_cfg["GATE_TRAIN_MIN_R"]
            )
            yg = cand["year_gate"]
            expected_e = yg["positive_years"] >= yg["total_years"] / 2 and (
                yg["best_year_share_of_tv_total_R"] is None
                or yg["best_year_share_of_tv_total_R"]
                <= gates_cfg["GATE_MAX_YEAR_SHARE"]
            )
            self.assertEqual(
                cand["gates"]["B_validation_evidence"], expected_b,
                f"{cid}: Gate B mismatch",
            )
            self.assertEqual(
                cand["gates"]["E_cross_period"], expected_e,
                f"{cid}: Gate E mismatch",
            )
            expected_decision = (
                "FROZEN"
                if all(cand["gates"].values())
                else "REJECTED"
            )
            self.assertEqual(cand["decision"], expected_decision,
                             f"{cid}: decision mismatch")

    def test_06_no_final_evaluation_for_rejected_candidates(self):
        for cid, cand in self.experiments["candidates"].items():
            has_final = "final_evaluation_after_freeze" in cand
            if cand["decision"] == "REJECTED":
                self.assertFalse(
                    has_final,
                    f"{cid}: rejected candidate must not be evaluated on the "
                    "final period",
                )
            else:
                self.assertTrue(
                    has_final,
                    f"{cid}: frozen candidate must have final evaluation "
                    "recorded",
                )


if __name__ == "__main__":
    unittest.main()
