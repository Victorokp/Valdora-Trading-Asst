"""Phase-30 preparation tests: G1 eligibility + G2 state mapping.

Task-required A1 eligibility cases (1-12) plus boundary tests and the
registered state-mapping grid. Synthetic fixtures only - no historical
data is used to simulate an A1 result, no Phase-30 artifact is produced.
"""

from __future__ import annotations

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from phase30.prep.eligibility import (  # noqa: E402
    A1_CUTOFF_DATE,
    A1_MIN_QUALIFYING_DAYS,
    check_a1_eligibility,
    count_qualifying_days,
    map_a1_state,
)

GOOD = {"Open": "1.1000", "High": "1.1100", "Low": "1.0900", "Close": "1.1050"}


def row(date_str: str, **overrides) -> dict:
    r = {"Date": date_str, **GOOD}
    r.update(overrides)
    return r


def future_days(n: int, start: str = "2026-09-26", skip_weekends: bool = False) -> list[str]:
    d = date.fromisoformat(start)
    out: list[str] = []
    while len(out) < n:
        if not skip_weekends or d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def valid_rows(n: int, start: str = "2026-09-26", skip_weekends: bool = False) -> list[dict]:
    return [row(ds) for ds in future_days(n, start, skip_weekends)]


class TestG1Eligibility(unittest.TestCase):
    def test_01_59_days_pending(self):
        """Case 1: 59 qualifying days -> PENDING."""
        r = check_a1_eligibility(valid_rows(59))
        self.assertFalse(r.eligible)
        self.assertEqual(r.qualifying_day_count, 59)
        self.assertIn("PENDING", " ".join(r.notes))

    def test_02_60_days_eligible(self):
        """Case 2: 60 qualifying days -> eligible."""
        r = check_a1_eligibility(valid_rows(60))
        self.assertTrue(r.eligible)
        self.assertEqual(r.qualifying_day_count, 60)

    def test_03_duplicate_date_quality_failure(self):
        """Case 3: 60 valid rows + one duplicate date -> flagged, not counted."""
        rows = valid_rows(60)
        dup = dict(rows[-1])  # same date, second observation
        rows.append(dup)
        r = check_a1_eligibility(rows)
        self.assertTrue(r.duplicates_present)
        # G1 condition 6: a date with a duplicate does not qualify, so the
        # duplicated date is removed from the count (60 valid -> 59):
        self.assertEqual(r.qualifying_day_count, 59)
        self.assertFalse(r.eligible)  # 59 < 60
        # the duplicate is surfaced for the quality gate, never repaired:
        self.assertTrue(any("duplicate" in n for n in r.notes))

    def test_04_invalid_ohlc_row_excluded(self):
        """Case 4: 60 rows with one invalid OHLC -> quality failure."""
        rows = valid_rows(60)
        rows.append(row("2026-12-01", Close=""))
        r = check_a1_eligibility(rows)
        self.assertTrue(r.invalid_rows_present)
        self.assertEqual(r.qualifying_day_count, 60)  # invalid row does not count

    def test_05_60_valid_rows_zero_trades_limited(self):
        """Case 5: 60 valid rows + zero trades -> LIMITED."""
        state = map_a1_state(n_trades=0, total_r=0.0, profit_factor=None)
        self.assertEqual(state, "LIMITED")

    def test_06_one_negative_trade_limited(self):
        """Case 6: 60 valid rows + 1 negative trade -> LIMITED."""
        state = map_a1_state(n_trades=1, total_r=-1.0, profit_factor=0.0)
        self.assertEqual(state, "LIMITED")

    def test_07_four_negative_trades_limited(self):
        """Case 7: 60 valid rows + 4 negative trades -> LIMITED."""
        state = map_a1_state(n_trades=4, total_r=-4.0, profit_factor=0.0)
        self.assertEqual(state, "LIMITED")

    def test_08_five_trades_registered_evaluation(self):
        """Case 8: 60 valid rows + 5 trades -> registered state logic."""
        self.assertEqual(
            map_a1_state(n_trades=5, total_r=6.0, profit_factor=1.5), "SUPPORTED"
        )
        self.assertEqual(
            map_a1_state(n_trades=5, total_r=1.0, profit_factor=0.8), "MIXED"
        )
        self.assertEqual(
            map_a1_state(n_trades=5, total_r=-5.0, profit_factor=0.0),
            "EVIDENCE_AGAINST",
        )

    def test_09_59_future_plus_100_historical_pending(self):
        """Case 9: 59 future days + 100 historical days -> still PENDING."""
        rows = valid_rows(59)
        hist_start = date.fromisoformat(A1_CUTOFF_DATE) - timedelta(days=120)
        for i in range(100):
            rows.append(row((hist_start + timedelta(days=i)).isoformat()))
        r = check_a1_eligibility(rows)
        self.assertEqual(r.qualifying_day_count, 59)
        self.assertFalse(r.eligible)

    def test_10_60_days_starting_after_cutoff_eligible(self):
        """Case 10: 60 future days beginning after 2026-09-25 -> eligible."""
        rows = valid_rows(60, start="2027-01-04")
        r = check_a1_eligibility(rows)
        self.assertTrue(r.eligible)
        self.assertEqual(r.first_qualifying_date, "2027-01-04")

    def test_11_calendar_dates_without_ohlc_do_not_qualify(self):
        """Case 11: 60 Mon-Fri calendar dates but missing OHLC -> not qualifying."""
        rows = [{"Date": ds} for ds in future_days(60, skip_weekends=True)]
        r = check_a1_eligibility(rows)
        self.assertEqual(r.qualifying_day_count, 0)
        self.assertTrue(r.invalid_rows_present)
        self.assertFalse(r.eligible)

    def test_12_duplicates_never_silently_deduplicated(self):
        """Case 12: duplicates are counted/flagged, never dropped in place."""
        rows = valid_rows(59) + [row("2026-09-26")]  # 59 unique + 1 dup
        # G1 condition 6: the duplicated date stops qualifying entirely:
        self.assertEqual(count_qualifying_days(rows), 58)
        # the checker reports the duplicate rather than repairing it:
        r = check_a1_eligibility(rows)
        self.assertTrue(r.duplicates_present)

    # ---- boundary tests (task section 13) --------------------------------

    def test_boundary_cutoff_date_excluded(self):
        """A1 must explicitly reject dates ON 2026-09-25."""
        rows = valid_rows(59) + [row(A1_CUTOFF_DATE)]
        r = check_a1_eligibility(rows)
        self.assertEqual(r.qualifying_day_count, 59)

    def test_boundary_before_cutoff_rejected(self):
        """A1 must reject dates before 2026-09-25."""
        rows = valid_rows(59) + [row("2026-09-24"), row("2020-01-01")]
        r = check_a1_eligibility(rows)
        self.assertEqual(r.qualifying_day_count, 59)

    def test_boundary_first_eligible_day(self):
        """2026-09-26 onward is inside the window."""
        rows = valid_rows(1, start="2026-09-26")
        r = check_a1_eligibility(rows)
        self.assertEqual(r.first_qualifying_date, "2026-09-26")

    def test_gate_does_not_use_today(self):
        """The checker depends only on the frozen cutoff, never today's date."""
        self.assertEqual(A1_CUTOFF_DATE, "2026-09-25")
        self.assertEqual(A1_MIN_QUALIFYING_DAYS, 60)


class TestG2StateMapping(unittest.TestCase):
    def test_pending_is_a_registration_status_not_here(self):
        """PENDING is an eligibility status (G1), not a result state."""
        # The mapper never returns PENDING: eligibility lives in G1.
        states = {
            map_a1_state(n_trades=n, total_r=r, profit_factor=pf)
            for n, r, pf in [(0, 0.0, None), (3, 1.0, 2.0), (9, -3.0, 0.7)]
        }
        self.assertNotIn("PENDING", states)

    def test_inconclusive_only_on_execution_failure(self):
        self.assertEqual(
            map_a1_state(n_trades=0, total_r=0.0, profit_factor=None, execution_failed=True),
            "INCONCLUSIVE",
        )

    def test_documented_small_sample_condition(self):
        self.assertEqual(
            map_a1_state(
                n_trades=6, total_r=0.0, profit_factor=1.0,
                documented_small_sample_condition="documented condition X",
            ),
            "LIMITED",
        )

    def test_positive_no_losses_pf_none_supported(self):
        """PF None (no losses) with positive R and n>=5 is SUPPORTED."""
        self.assertEqual(
            map_a1_state(n_trades=5, total_r=10.0, profit_factor=None), "SUPPORTED"
        )

    def test_zero_r_n5_neutral_mixed(self):
        self.assertEqual(map_a1_state(n_trades=5, total_r=0.0, profit_factor=1.0), "MIXED")


if __name__ == "__main__":
    unittest.main()
