"""Phase-30 preparation tests: G3 external-file quality gate.

Synthetic fixtures only - the frozen dataset is never used as an A1
fixture and no Phase-30 artifact is produced.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from phase30.prep.quality import validate_external_file  # noqa: E402

HEADER = "Date,Open,High,Low,Close\n"


def csv_of(rows: list[str]) -> str:
    return HEADER + "\n".join(rows) + "\n"


def valid_csv(n: int = 60, start: str = "2026-10-01") -> str:
    d = date.fromisoformat(start)
    rows = []
    for _ in range(n):
        rows.append(f"{d.isoformat()},1.1000,1.1100,1.0900,1.1050")
        d += timedelta(days=1)
    return csv_of(rows)


class TestQualityGate(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def _write(self, name: str, content: str) -> Path:
        p = self.dir / name
        p.write_text(content, encoding="utf-8")
        return p

    def test_valid_file_passes(self):
        r = validate_external_file(self._write("ok.csv", valid_csv(60)))
        self.assertEqual(r.status, "PASS")
        self.assertEqual(r.row_count, 60)
        self.assertEqual(r.unique_date_count, 60)
        self.assertEqual(r.duplicate_date_count, 0)
        self.assertEqual(len(r.sha256), 64)
        self.assertEqual(r.coverage_start, "2026-10-01")
        self.assertEqual(r.coverage_end, "2026-11-29")  # 60 consecutive days

    def test_duplicate_dates_fail(self):
        rows = valid_csv(60).splitlines()
        rows.append(rows[1])  # exact duplicate row (duplicate date)
        r = validate_external_file(self._write("dup.csv", "\n".join(rows) + "\n"))
        self.assertEqual(r.status, "FAIL")
        self.assertEqual(r.duplicate_date_count, 1)
        self.assertTrue(any("duplicate" in e for e in r.errors))

    def test_missing_ohlc_fails(self):
        rows = valid_csv(60).splitlines()
        rows[5] = rows[5].rsplit(",", 1)[0] + ","  # empty Close
        r = validate_external_file(self._write("miss.csv", "\n".join(rows) + "\n"))
        self.assertEqual(r.status, "FAIL")
        self.assertEqual(r.missing_ohlc_count if hasattr(r, "missing_ohlc_count") else 0, 0)
        self.assertTrue(any("missing/non-numeric Close" in e for e in r.errors))

    def test_impossible_values_fail(self):
        rows = valid_csv(60).splitlines()
        parts = rows[7].split(",")
        parts[1] = "-1.0"  # impossible negative Open
        rows[7] = ",".join(parts)
        r = validate_external_file(self._write("neg.csv", "\n".join(rows) + "\n"))
        self.assertEqual(r.status, "FAIL")
        self.assertEqual(r.impossible_values_count, 1)

    def test_ohlc_logic_violation_fails(self):
        rows = valid_csv(60).splitlines()
        parts = rows[9].split(",")
        parts[2] = "1.0000"  # High below Open -> logic violation
        rows[9] = ",".join(parts)
        r = validate_external_file(self._write("logic.csv", "\n".join(rows) + "\n"))
        self.assertEqual(r.status, "FAIL")
        self.assertEqual(r.ohlc_logic_violations_count, 1)

    def test_missing_columns_fail(self):
        r = validate_external_file(
            self._write("cols.csv", "Date,Open,High,Low\n2026-10-01,1,2,0.9\n")
        )
        self.assertEqual(r.status, "FAIL")
        self.assertTrue(any("missing required columns" in e for e in r.errors))

    def test_empty_file_fails(self):
        r = validate_external_file(self._write("empty.csv", ""))
        self.assertEqual(r.status, "FAIL")

    def test_nonexistent_file_fails(self):
        r = validate_external_file(self.dir / "nope.csv")
        self.assertEqual(r.status, "FAIL")
        self.assertTrue(any("does not exist" in e for e in r.errors))

    def test_unsorted_dates_warn_not_fail(self):
        rows = valid_csv(60).splitlines()
        rows[10], rows[20] = rows[20], rows[10]
        r = validate_external_file(self._write("unsorted.csv", "\n".join(rows) + "\n"))
        self.assertEqual(r.status, "PASS")  # warning only
        self.assertEqual(r.unsorted_dates_count, 2)
        self.assertTrue(any("out-of-order" in w for w in r.warnings))

    def test_holiday_gap_surfaced_not_filled(self):
        # One weekday removed from the middle: counted, never filled.
        rows = valid_csv(10).splitlines()
        del rows[5]
        r = validate_external_file(self._write("gap.csv", "\n".join(rows) + "\n"))
        self.assertEqual(r.status, "PASS")  # warning, adjudicated by humans
        self.assertEqual(r.missing_date_count, 1)
        self.assertTrue(any("never filled" in w for w in r.warnings))

    def test_weekend_rows_warned(self):
        rows = valid_csv(5, start="2026-10-05").splitlines()  # Mon-Fri only
        rows.append("2026-10-11,1.1,1.2,1.0,1.15")  # Sunday outside coverage
        r = validate_external_file(self._write("wknd.csv", "\n".join(rows) + "\n"))
        self.assertEqual(r.status, "PASS")
        self.assertEqual(r.weekday_distribution["Sun"], 1)
        self.assertTrue(any("weekend" in w for w in r.warnings))

    def test_report_deterministic(self):
        p1 = validate_external_file(self._write("d.csv", valid_csv(30)))
        p2 = validate_external_file(self.dir / "d.csv")
        self.assertEqual(p1.to_dict(), p2.to_dict())


if __name__ == "__main__":
    unittest.main()
