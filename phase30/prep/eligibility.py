"""G1 + G2 - A1 eligibility (qualifying-day counter) and state mapping.

G1 clarifies what a "qualifying trading day" is for the registered A1
eligibility gate (>= 60 qualifying trading days strictly after
2026-09-25). The clarification defines the counting unit; it does NOT
move the threshold, the window, or the boundary date.

G2 fills ONLY the state-mapping cells the registry leaves silent
(zero trades; negative total R with fewer than 5 resolved trades). The
registered A1 failure criteria continue to govern every outcome they
already map; the registry's exact words remain authoritative:

    "state SUPPORTED requires positive total R and PF > 1 with >= 5
    trades; state MIXED if positive R but PF <= 1 or n < 5; negative R
    with >= 5 trades is recorded as evidence *against* persistence;
    INCONCLUSIVE applies only to a post-threshold execution failure."

INERT: no I/O, no clock use, no strategy code. All data is supplied by
the caller.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Constants (mirrored in phase30.prep.constants; duplicated here to keep
# this module import-light and dependency-free).
A1_CUTOFF_DATE = "2026-09-25"
A1_MIN_QUALIFYING_DAYS = 60


@dataclass(frozen=True)
class EligibilityResult:
    """Deterministic eligibility record for one candidate A1 file."""

    eligible: bool
    qualifying_day_count: int
    min_required: int
    duplicates_present: bool
    invalid_rows_present: bool
    first_qualifying_date: str | None
    last_qualifying_date: str | None = None
    window_first_date: str = "2026-09-26"
    notes: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        d = {
            "eligible": self.eligible,
            "qualifying_day_count": self.qualifying_day_count,
            "min_required": self.min_required,
            "duplicates_present": self.duplicates_present,
            "invalid_rows_present": self.invalid_rows_present,
            "first_qualifying_date": self.first_qualifying_date,
            "last_qualifying_date": self.last_qualifying_date,
            "window_first_date": self.window_first_date,
            "notes": list(self.notes),
        }
        return d


def count_qualifying_days(
    rows: list[dict],
    *,
    date_key: str = "Date",
    ohlc_keys: tuple[str, ...] = ("Open", "High", "Low", "Close"),
) -> int:
    """Count qualifying trading days per the G1 definition.

    A row qualifies iff ALL of: (1) its date is strictly after the A1
    cutoff 2026-09-25; (2) all four OHLC values are present and numeric;
    (3) its date appears exactly once across ``rows`` (duplicates
    disqualify, they are never deduplicated). The count is a plain int;
    callers needing provenance should use :func:`check_a1_eligibility`.
    """
    from datetime import date as _date

    cutoff = _date.fromisoformat(A1_CUTOFF_DATE)
    seen: dict = {}
    qualifying = 0
    for row in rows:
        raw = (row.get(date_key) or "").strip()
        try:
            d = _date.fromisoformat(raw)
        except ValueError:
            continue
        if d <= cutoff:
            continue
        if all(_is_finite_number(row.get(k)) for k in ohlc_keys):
            seen[d] = seen.get(d, 0) + 1
    for n in seen.values():
        if n == 1:
            qualifying += 1
    return qualifying


def _is_finite_number(value: object) -> bool:
    """True iff value parses to a finite, positive float."""
    if value is None:
        return False
    s = str(value).strip()
    if not s:
        return False
    try:
        v = float(s)
    except ValueError:
        return False
    return v == v and v not in (float("inf"), float("-inf")) and v > 0


def check_a1_eligibility(rows: list[dict]) -> EligibilityResult:
    """Full deterministic A1 eligibility record for a candidate file.

    Implements the G1 eligibility rule: A1 is eligible iff the count of
    valid, unique, qualifying daily OHLC dates strictly after
    2026-09-25 is >= 60. Boundary tests (cutoff date itself, earlier
    dates) are enforced here and never depend on today's date.
    """
    from datetime import date as _date

    cutoff = _date.fromisoformat(A1_CUTOFF_DATE)
    notes: list[str] = []

    seen: dict = {}
    duplicate_dates = 0
    invalid_after_cutoff = 0
    first_qual = None
    last_qual = None

    for row in rows:
        raw = (row.get("Date") or "").strip()
        try:
            d = _date.fromisoformat(raw)
        except ValueError:
            continue
        if d <= cutoff:
            continue
        valid = all(_is_finite_number(row.get(k)) for k in ("Open", "High", "Low", "Close"))
        if not valid:
            invalid_after_cutoff += 1
            continue
        if d in seen:
            duplicate_dates += 1
        seen[d] = seen.get(d, 0) + 1
        if first_qual is None or d < first_qual:
            first_qual = d
        if last_qual is None or d > last_qual:
            last_qual = d

    qualifying = sum(1 for n in seen.values() if n == 1)
    eligible = qualifying >= A1_MIN_QUALIFYING_DAYS

    if duplicate_dates:
        notes.append(
            f"{duplicate_dates} duplicate date(s) after cutoff - they do not "
            "count and are NOT deduplicated; quality gate must FAIL this file"
        )
    if invalid_after_cutoff:
        notes.append(
            f"{invalid_after_cutoff} row(s) after cutoff missing/invalid OHLC - "
            "excluded from the qualifying count"
        )
    if not eligible:
        notes.append(
            f"PENDING: {qualifying} < {A1_MIN_QUALIFYING_DAYS} qualifying days"
        )

    return EligibilityResult(
        eligible=eligible,
        qualifying_day_count=qualifying,
        min_required=A1_MIN_QUALIFYING_DAYS,
        duplicates_present=duplicate_dates > 0,
        invalid_rows_present=invalid_after_cutoff > 0,
        first_qualifying_date=first_qual.isoformat() if first_qual else None,
        last_qualifying_date=last_qual.isoformat() if last_qual else None,
        notes=tuple(notes),
    )


# ---------------------------------------------------------------- G2 -----

A1State = Literal[
    "PENDING", "LIMITED", "SUPPORTED", "MIXED", "EVIDENCE_AGAINST", "INCONCLUSIVE"
]


def map_a1_state(
    *,
    n_trades: int,
    total_r: float,
    profit_factor: float | None,
    execution_failed: bool = False,
    documented_small_sample_condition: str | None = None,
) -> A1State:
    """Map an A1 outcome to its registered/clarified evidence state.

    Order of rules (first match wins):

    1. ``execution_failed=True`` -> INCONCLUSIVE (registry: post-threshold
       technical failure, the only INCONCLUSIVE path).
    2. ``n_trades == 0`` -> LIMITED (G2 clarification: zero-trade case;
       PF/WR must not be assigned, no zero-valued performance metrics).
    3. ``total_r < 0`` and ``n_trades < 5`` -> LIMITED (G2 clarification:
       small-negative case; exact n and total R are reported by the
       caller, the sample is not treated as a decisive failure).
    4. ``documented_small_sample_condition`` given -> LIMITED (G2 escape
       hatch; caller must document the condition explicitly).
    5. ``total_r > 0`` and ``profit_factor is not None and profit_factor > 1.0``
       and ``n_trades >= 5`` -> SUPPORTED (registered).
    6. ``total_r > 0`` (positive but PF <= 1 or n < 5) -> MIXED (registered).
    7. ``total_r < 0`` (any remaining case, i.e. n >= 5) -> EVIDENCE_AGAINST
       (registry wording: "negative R with >= 5 trades is recorded as
       evidence *against* persistence (descriptive - the phase's decision
       states are neutral; this is not a BREAK state)").
    8. ``total_r == 0`` with n >= 5 -> MIXED (neither positive nor
       negative; registered criteria do not map it; neutral default).

    ``profit_factor is None`` (e.g. no losing trades) with positive R is
    treated as ``PF > 1`` for rule 5 (a positive-R sample with no losses
    trivially satisfies PF > 1).
    """
    if execution_failed:
        return "INCONCLUSIVE"
    if n_trades == 0:
        return "LIMITED"
    if total_r < 0 and n_trades < 5:
        return "LIMITED"
    if documented_small_sample_condition:
        return "LIMITED"
    pf_positive = profit_factor is None or profit_factor > 1.0
    if total_r > 0 and pf_positive and n_trades >= 5:
        return "SUPPORTED"
    if total_r > 0:
        return "MIXED"
    if total_r < 0:
        return "EVIDENCE_AGAINST"
    return "MIXED"

