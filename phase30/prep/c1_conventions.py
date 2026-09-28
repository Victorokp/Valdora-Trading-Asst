"""C1 - convention-validation interface (exactly two registered variants).

Registry C1 fixes exactly two variants; no third convention variant may
ever be introduced. This module provides only the deterministic,
frame-level transformation interfaces:

- Variant 1 (``sunday_bar_removal``): remove Sunday-dated daily rows
  before running the frozen strategy. No interpolation, merging,
  resampling, or OHLC reconstruction; remaining OHLC unchanged; the
  number of removed rows is reported.
- Variant 2 (``timestamp_convention_shift``): apply the DECLARED fixed
  UTC offset (declared before C1 execution, per registry) to timestamps
  only, reassign calendar dates, and document date-boundary changes.
  OHLC values are never altered.

On date-only daily bars, a declared offset that is not a whole number
of days cannot be represented deterministically; per registry, that is
the recorded LIMITED path for Variant 2 - not a manual reinterpretation.

INERT: no I/O, no strategy code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

VARIANT_1 = "sunday_bar_removal"
VARIANT_2 = "timestamp_convention_shift"


@dataclass
class SundayRemovalResult:
    """Outcome of Variant 1 (deterministic, frame-level)."""

    rows_removed: int
    removed_dates: list[str] = field(default_factory=list)
    remaining_rows: int = 0

    def to_dict(self) -> dict:
        return {
            "variant": VARIANT_1,
            "rows_removed": self.rows_removed,
            "removed_dates": list(self.removed_dates),
            "remaining_rows": self.remaining_rows,
        }


def remove_sunday_bars(rows: list[dict], *, date_key: str = "Date") -> SundayRemovalResult:
    """Variant 1: drop rows dated Sunday (weekday() == 6). Read-only on
    the input list; returns a new list via ``remaining_rows`` count."""
    kept: list[dict] = []
    removed: list[str] = []
    for row in rows:
        raw = (row.get(date_key) or "").strip()
        try:
            d = datetime.fromisoformat(raw).date()
        except ValueError:
            kept.append(row)  # unparseable dates are a quality-gate matter
            continue
        if d.weekday() == 6:
            removed.append(d.isoformat())
        else:
            kept.append(row)
    return SundayRemovalResult(
        rows_removed=len(removed),
        removed_dates=removed,
        remaining_rows=len(kept),
    )


@dataclass
class TimestampShiftResult:
    """Outcome of Variant 2 on date-only daily bars."""

    applied: bool
    limited_reason: str | None = None
    declared_offset_hours: float | None = None
    offset_days: int | None = None
    rows_shifted: int = 0
    weekend_dates_created: list[str] = field(default_factory=list)
    rows: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "variant": VARIANT_2,
            "applied": self.applied,
            "limited_reason": self.limited_reason,
            "declared_offset_hours": self.declared_offset_hours,
            "offset_days": self.offset_days,
            "rows_shifted": self.rows_shifted,
            "weekend_dates_created": list(self.weekend_dates_created),
            "rows": self.rows,
        }


def apply_timestamp_shift(
    rows: list[dict],
    *,
    declared_offset_hours: float,
    date_key: str = "Date",
) -> TimestampShiftResult:
    """Variant 2: shift date-only stamps by the DECLARED fixed offset.

    ``declared_offset_hours`` must be documented from the two sources'
    conventions BEFORE C1 execution (registry). If it is not a whole
    multiple of 24h, date-only bars cannot represent the shift
    deterministically and the result is the registered LIMITED path.
    OHLC values are never touched.
    """
    if declared_offset_hours % 24 != 0:
        return TimestampShiftResult(
            applied=False,
            limited_reason=(
                f"declared offset {declared_offset_hours}h is not a whole "
                "number of days; date-only daily bars cannot represent it "
                "deterministically - Variant 2 is LIMITED per registry"
            ),
            declared_offset_hours=declared_offset_hours,
        )

    offset_days = int(declared_offset_hours // 24)
    shifted: list[dict] = []
    weekend: list[str] = []
    for row in rows:
        raw = (row.get(date_key) or "").strip()
        try:
            d = datetime.fromisoformat(raw).date()
        except ValueError:
            shifted.append(dict(row))
            continue
        new_date = d.toordinal() + offset_days
        nd = date.fromordinal(new_date)
        if nd.weekday() >= 5:
            weekend.append(nd.isoformat())
        new_row = dict(row)
        new_row[date_key] = nd.isoformat()
        shifted.append(new_row)

    return TimestampShiftResult(
        applied=True,
        declared_offset_hours=declared_offset_hours,
        offset_days=offset_days,
        rows_shifted=len(shifted),
        weekend_dates_created=weekend,
        rows=shifted,
    )
