"""Phase-31 execution tests (preregistered reproducibility gates).

Verifies: input immutability, deterministic rerun (byte-identical
outputs), artifact presence/completeness, and the preregistered
seed/count parameters recorded in the runtime log.
"""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "phase31" / "results"
LOG = RESULTS / "phase31_runtime_log.json"

GOLDEN = ("b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95")
DATASET = ("e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52")
LEDGER = ("30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0")

ARTIFACTS = [
    "A1_block_resampling.csv", "A1_summary.json",
    "B1_sign_permutation.csv", "B1_summary.json", "B2_consumed.json",
    "C1_concentration.csv", "C2_clusters.csv", "C2_summary.json",
    "C3_drawdown_structure.csv", "phase31_runtime_log.json",
    "D1_research_inventory.md", "D2_selection_assessment.md",
    "E1_evidence_matrix.md",
]


def sha256_file(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class TestPhase31Execution(unittest.TestCase):
    def test_01_inputs_immutable(self):
        self.assertEqual(sha256_file(ROOT / "phase21_historical_reference.py"),
                         GOLDEN)
        self.assertEqual(sha256_file(ROOT / "eurusd_d.csv"), DATASET)
        self.assertEqual(
            sha256_file(ROOT / "phase21_experiment_results" / "phase21_trades.csv"),
            LEDGER)

    def test_02_all_registered_artifacts_exist(self):
        for name in ARTIFACTS:
            self.assertTrue((RESULTS / name).exists(), name)

    def test_03_preregistered_seeds_and_counts(self):
        d = json.load(open(LOG))
        self.assertEqual(d["a1"], {"monthly": 20260926,
                                   "quarterly": 20260927,
                                   "yearly": 20260928})
        self.assertEqual(d["a1_resamples"], 10_000)
        self.assertEqual(d["b1_seed"], 20260929)
        self.assertEqual(d["b1_permutations"], 10_000)
        for s in d["a1_summaries"]:
            self.assertEqual(s["resamples"], 10_000)

    def test_04_b1_interpretation_guard_present(self):
        d = json.load(open(LOG))
        self.assertIn("NOT a definitive p-value", d["b1"]["interpretation_guard"])
        self.assertEqual(d["b1"]["observed_percentile_total_R"], 97.75)
        self.assertEqual(d["b1"]["p_null_ge_observed"], 0.0225)

    def test_05_control_values_unchanged(self):
        d = json.load(open(RESULTS / "A1_summary.json"))
        self.assertEqual(d["observed_total_R"], 32.2644)
        self.assertEqual(d["observed_maxDD_R"], -12.0)
        self.assertEqual(d["n_trades"], 115)

    def test_06_b2_consumed_not_regenerated(self):
        d = json.load(open(RESULTS / "B2_consumed.json"))
        src = json.load(open(ROOT / "phase29" / "results" / "phase29_summary.json"))
        self.assertEqual(d["g_order_stress"], src["g_order_stress"])
        self.assertIn("no rerun", d["note"].lower())

    def test_07_c3_consistent_with_phase29_episodes(self):
        d = json.load(open(LOG))
        self.assertEqual(d["c3"]["n_episodes"], 10)
        self.assertEqual(d["c3"]["max_drawdown_R"], -12.0)
        self.assertEqual(d["c3"]["total_time_underwater_trades"], 89)

    def test_08_deterministic_rerun_byte_identical(self):
        before = {p.name: sha256_file(p) for p in sorted(RESULTS.glob("*"))
                  if p.is_file()}
        r = subprocess.run(
            [sys.executable, str(ROOT / "phase31" / "phase31_execute.py")],
            capture_output=True, text=True, cwd=ROOT, timeout=600)
        self.assertEqual(r.returncode, 0, r.stderr[-2000:])
        after = {p.name: sha256_file(p) for p in sorted(RESULTS.glob("*"))
                 if p.is_file()}
        self.assertEqual(before, after)

    def test_09_post_gate_pass_recorded(self):
        d = json.load(open(LOG))
        self.assertTrue(d.get("post_gate_pass"))


if __name__ == "__main__":
    unittest.main()
