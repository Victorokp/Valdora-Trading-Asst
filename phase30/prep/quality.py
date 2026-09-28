"""G3 - deterministic external-file quality gate.

Validates any future external dataset BEFORE a research family executes
(A1, A2, C1, D1; B1 if an external file is involved). This is a
data-integrity control, not a research test: it never repairs,
deduplicates, interpolates, or fills data. Defects fail the gate and are
reported; the source file is preserved as-is.

Stricter than the GR loader on purpose: the GR loader silently drops
rows with missing OHLC, so this gate surfaces (missing-OHLC rows,
duplicate dates, gaps, schema defects) at registration time instead of
letting them silently shift an A2/C1/D1 divergence interpretation.

INERT: operates only on the file a caller explicitly supplies.
"""

from __future__ import annotations

import csv
import hashlib
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

REQUIRED_COLUMNS = ("Date", "Open", "High", "Low", "Close")
A1_CUTOFF_DATE = "2026-09-25"
MISSING_DATES_ITEMIZE_LIMIT = 50


@dataclass
class QualityReport:
    """Deterministic, serializable quality report for one candidate file."""

    path: str
    sha256: str
    row_count: int = 0
    column_inventory: list[str] = field(default_factory=list)
    coverage_start: str | None = None
    coverage_end: str | None = None
    unique_date_count: int = 0
    duplicate_date_count: int = 0
    missing_ohlc_count: int = 0
    unsorted_dates_count: int = 0
    impossible_values_count: int = 0
    ohlc_logic_violations_count: int = 0
    missing_date_count: int = 0
    missing_dates: list[str] = field(default_factory=list)
    weekday_distribution: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    status: str = "PASS"

    def to_dict(self) -> dict:
        """Ordered dict in report field order (deterministic serialization)."""
        return {
            "path": self.path,
            "sha256": self.sha256,
            "row_count": self.row_count,
            "column_inventory": list(self.column_inventory),
            "coverage_start": self.coverage_start,
            "coverage_end": self.coverage_end,
            "unique_date_count": self.unique_date_count,
            "duplicate_date_count": self.duplicate_date_count,
            "missing_ohlc_count": self.missing_ohlc_count,
            "unsorted_dates_count": self.unsorted_dates_count,
            "impossible_values_count": self.impossible_values_count,
            "ohlc_logic_violations_count": self.ohlc_logic_violations_count,
            "missing_date_count": self.missing_date_count,
            "missing_dates": list(self.missing_dates),
            "weekday_distribution": dict(self.weekday_distribution),
            "errors": list(self.errors),
            "warnings": list(self.warnings),
            "status": self.status,
        }


def _sha256_file(path: Path) -> str:
    """SHA-256 of a file, streamed (read-only)."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_external_file(
    path: str | Path,
    a1_cutoff_date: str = A1_CUTOFF_DATE,
) -> QualityReport:
    """Validate a candidate external daily-OHLC CSV file.

    Deterministic and read-only; performs NO repair, deduplication, or
    interpolation. Gate rules (frozen):

    HARD FAIL (errors) - these stop the affected family per the G3
    clarification, mirroring the registered contamination control that a
    data-quality breach is reported, never repaired:
      - unreadable or empty file; missing required columns;
      - duplicate dates (never silently deduplicated);
      - missing/non-numeric OHLC in any row;
      - impossible values (any of O/H/L/C <= 0);
      - OHLC logic violations (High < max(Open, Close),
        Low > min(Open, Close), High < Low).

    WARNINGS (reported, do not block - legitimate market-calendar
    effects cannot be distinguished from defects without an external
    holiday calendar, so they are surfaced, not adjudicated):
      - weekday dates absent inside the claimed coverage (holidays);
      - rows dated Saturday/Sunday (C1-relevant weekend bars);
      - dates not in ascending order in file order.

    ``a1_cutoff_date`` is recorded in the report as a reference note
    only; the A1 window rule itself lives in
    ``phase30.prep.eligibility``. The function NEVER uses today's date.
    """
    p = Path(path)
    report = QualityReport(path=str(p), sha256="")

    if not p.is_file():
        report.errors.append("file does not exist")
        report.status = "FAIL"
        return report

    report.sha256 = _sha256_file(p)

    try:
        with open(p, "r", newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            rows = list(reader)
    except (OSError, UnicodeDecodeError, csv.Error) as exc:
        report.errors.append(f"unreadable file: {exc}")
        report.status = "FAIL"
        return report

    report.row_count = len(rows)
    if report.row_count == 0:
        report.errors.append("file contains no data rows")
        report.status = "FAIL"
        return report

    if reader.fieldnames is None:
        report.errors.append("no header row")
        report.status = "FAIL"
        return report
    report.column_inventory = [c.strip() for c in reader.fieldnames]
    missing_cols = [c for c in REQUIRED_COLUMNS if c not in report.column_inventory]
    if missing_cols:
        report.errors.append(f"missing required columns: {missing_cols}")
        report.status = "FAIL"
        return report

    dates: list = []
    weekday_counts = {"Mon": 0, "Tue": 0, "Wed": 0, "Thu": 0, "Fri": 0, "Sat": 0, "Sun": 0}
    weekend_dates: list = []

    for i, row in enumerate(rows, start=2):  # header is line 1
        raw_date = (row.get("Date") or "").strip()
        try:
            d = datetime.fromisoformat(raw_date).date()
        except ValueError:
            report.errors.append(f"line {i}: unparseable date {raw_date!r}")
            continue
        dates.append(d)

        vals = {}
        bad = False
        for c in ("Open", "High", "Low", "Close"):
            raw = (row.get(c) or "").strip()
            try:
                v = float(raw)
            except ValueError:
                report.errors.append(f"line {i}: missing/non-numeric {c}")
                bad = True
                continue
            vals[c] = v
            if v <= 0:
                report.impossible_values_count += 1
                report.errors.append(f"line {i}: impossible {c}={v}")
        if bad:
            continue

        o, h, l, c = vals["Open"], vals["High"], vals["Low"], vals["Close"]
        if h < max(o, c) or l > min(o, c) or h < l:
            report.ohlc_logic_violations_count += 1
            report.errors.append(f"line {i}: OHLC logic violation (H={h} L={l} O={o} C={c})")

    if report.errors:
        report.status = "FAIL"

    # Duplicate dates: reported, never deduplicated.
    counts = Counter(dates)
    report.unique_date_count = len(counts)
    report.duplicate_date_count = sum(n - 1 for n in counts.values() if n > 1)
    if report.duplicate_date_count > 0:
        report.errors.append(
            f"{report.duplicate_date_count} duplicate date(s) - not deduplicating"
        )
        report.status = "FAIL"

    # File-order monotonicity.
    report.unsorted_dates_count = sum(
        1 for a, b in zip(dates, dates[1:]) if b <= a
    )
    if report.unsorted_dates_count > 0:
        report.warnings.append(
            f"{report.unsorted_dates_count} out-of-order date(s) in file order"
        )

    if dates:
        report.coverage_start = min(dates).isoformat()
        report.coverage_end = max(dates).isoformat()

    # Weekday distribution over unique dates; weekend rows flagged (C1).
    for d in counts:
        weekday_counts[d.strftime("%a")] += 1
        if d.weekday() >= 5:
            weekend_dates.append(d)
    report.weekday_distribution = weekday_counts
    if weekend_dates:
        report.warnings.append(
            f"{len(weekend_dates)} weekend-dated row(s) present (C1-relevant)"
        )

    # Missing weekday dates inside claimed coverage (holidays surface here).
    if len(counts) >= 2:
        ordered = sorted(counts)
        missing: list = []
        cursor = ordered[0].toordinal()
        for d in ordered[1:]:
            cursor += 1
            while cursor < d.toordinal():
                gap = date.fromordinal(cursor)
                if gap.weekday() < 5:
                    missing.append(gap)
                cursor += 1
        report.missing_date_count = len(missing)
        if missing:
            report.missing_dates = [m.isoformat() for m in missing[:MISSING_DATES_ITEMIZE_LIMIT]]
            note = "" if len(missing) <= MISSING_DATES_ITEMIZE_LIMIT else " (first 50 listed)"
            report.warnings.append(
                f"{len(missing)} weekday date(s) absent within coverage{note}; "
                "reported, never filled"
            )

    if a1_cutoff_date:
        report.warnings.append(
            f"a1 cutoff reference: {a1_cutoff_date} (window rule lives in "
            "phase30.prep.eligibility, not here)"
        )

    return report