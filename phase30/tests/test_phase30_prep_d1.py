"""Phase-30 preparation tests: G4 D1 registry, pip constants, coverage."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from phase30.prep.d1_registry import (  # noqa: E402
    D1_PAIRS,
    EXTERNAL_PAIRS,
    PIP_CONSTANTS,
    REPO_FILES,
    CoverageStatus,
    assess_pair_coverage,
    pip_for,
    validate_d1_registry,
)
from phase30.prep.quality import validate_external_file  # noqa: E402

REQUIRED = {
    "GBPUSD": 0.0001,
    "USDJPY": 0.01,
    "AUDUSD": 0.0001,
    "NZDUSD": 0.0001,
    "USDCHF": 0.0001,
    "USDCAD": 0.0001,
}


class TestD1Registry(unittest.TestCase):
    def test_six_and_only_six_pairs(self):
        self.assertEqual(len(D1_PAIRS), 6)
        self.assertEqual(set(D1_PAIRS), set(REQUIRED))
        self.assertEqual(
            D1_PAIRS, ("GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCHF", "USDCAD")
        )

    def test_pip_constants_exactly_as_specified(self):
        self.assertEqual(PIP_CONSTANTS, REQUIRED)

    def test_usdjpy_uses_0_01(self):
        self.assertEqual(pip_for("USDJPY"), 0.01)

    def test_other_five_use_0_0001(self):
        for pair in ("GBPUSD", "AUDUSD", "NZDUSD", "USDCHF", "USDCAD"):
            self.assertEqual(pip_for(pair), 0.0001, pair)

    def test_missing_pair_not_substituted(self):
        """A pair outside the frozen universe is refused - never replaced."""
        with self.assertRaises(KeyError):
            pip_for("EURUSD")
        with self.assertRaises(KeyError):
            pip_for("XAUUSD")

    def test_registry_self_consistency(self):
        result = validate_d1_registry()
        self.assertTrue(result["valid"], result["problems"])
        self.assertEqual(set(REPO_FILES) | set(EXTERNAL_PAIRS), set(D1_PAIRS))

    def test_sufficient_coverage(self):
        a = assess_pair_coverage(
            "NZDUSD",
            coverage_start="2003-01-02",
            coverage_end="2026-09-24",
            unique_date_count=5900,
            source_documented=True,
        )
        self.assertEqual(a.status, CoverageStatus.SUFFICIENT)

    def test_insufficient_coverage_never_passes(self):
        a = assess_pair_coverage(
            "USDCHF",
            coverage_start="2015-01-01",
            coverage_end="2026-09-24",
            source_documented=True,
        )
        self.assertEqual(a.status, CoverageStatus.INSUFFICIENT)
        self.assertIn("2010-01-01", a.missing_registered_slice)

    def test_unknown_coverage_when_undocumented(self):
        a = assess_pair_coverage("USDCAD", coverage_start=None, coverage_end=None)
        self.assertEqual(a.status, CoverageStatus.UNKNOWN)
        b = assess_pair_coverage(
            "USDCAD", coverage_start="2018-01-01", coverage_end="2026-01-01",
            source_documented=False,
        )
        self.assertEqual(b.status, CoverageStatus.UNKNOWN)

    def test_malformed_external_file_fails_validation(self):
        """A malformed D1 candidate file fails the G3 gate (never repaired)."""
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "nzdusd_d.csv"
            p.write_text(
                "Date,Open,High,Low,Close\n"
                "2015-01-01,0.7,0.71,0.69,0.705\n"
                "2015-01-01,0.7,0.71,0.69,0.705\n"  # duplicate date
                "2015-01-02,,0.71,0.69,0.705\n",    # missing Open
                encoding="utf-8",
            )
            r = validate_external_file(p)
            self.assertEqual(r.status, "FAIL")
            self.assertEqual(r.duplicate_date_count, 1)


if __name__ == "__main__":
    unittest.main()
