"""G4 - frozen D1 six-pair registry, pinned pip constants, coverage gate.

The six-pair universe is FROZEN at preregistration (registry, Family D):
exactly GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCHF, USDCAD. No pair may be
added, removed, or replaced before or after results.

G4 pins the per-pip constant explicitly for every pair (never inferred
from observed decimal precision), consistent with the Phase-29 mapping
(GBPUSD/AUDUSD 0.0001, USDJPY 0.01). The historical GR/Phase-29 files
remain untouched; these constants bind only the preparation layer and
future D1 execution.

Coverage uses the G4 tri-state (no invented numeric minimum):
COVERAGE SUFFICIENT / INSUFFICIENT / UNKNOWN against the REGISTERED
2010-2025 D1 slice. An unavailable/insufficient pair follows the
registered UNAVAILABLE/LIMITED path; it is never substituted.

INERT: no I/O, no research execution.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

# Frozen universe (PHASE30_EXPERIMENT_REGISTRY.md, Family D).
D1_PAIRS = ("GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCHF", "USDCAD")

# G4 pinned pip constants (clarification 2026-09-28). Never inferred
# from observed decimal precision; consistent with the Phase-29 mapping.
PIP_CONSTANTS = {
    "GBPUSD": 0.0001,
    "AUDUSD": 0.0001,
    "NZDUSD": 0.0001,
    "USDCHF": 0.0001,
    "USDCAD": 0.0001,
    "USDJPY": 0.01,
}

# Registered per-pair historical files already in the repository
# (hash-verified before use at D1 execution time).
REPO_FILES = {
    "GBPUSD": "gbpusd_d.csv",
    "AUDUSD": "audusd_d.csv",
    "USDJPY": "usdjpy_d.csv",
}

# Pairs whose data must be externally acquired and registered
# (hashed + quality-gated) before any D1 output is generated.
EXTERNAL_PAIRS = ("NZDUSD", "USDCHF", "USDCAD")

# Registered D1 comparison slice (registry: full-history and 2010-2025).
D1_SLICE_START = "2010-01-01"
D1_SLICE_END = "2025-12-31"


class CoverageStatus(Enum):
    SUFFICIENT = "COVERAGE SUFFICIENT"
    INSUFFICIENT = "COVERAGE INSUFFICIENT"
    UNKNOWN = "COVERAGE UNKNOWN"


@dataclass
class PairCoverageAssessment:
    """G4 tri-state coverage assessment for one registered pair."""

    pair: str
    status: CoverageStatus
    coverage_start: str | None = None
    coverage_end: str | None = None
    unique_date_count: int | None = None
    missing_registered_slice: str | None = None
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "pair": self.pair,
            "status": self.status.value,
            "coverage_start": self.coverage_start,
            "coverage_end": self.coverage_end,
            "unique_date_count": self.unique_date_count,
            "missing_registered_slice": self.missing_registered_slice,
            "reason": self.reason,
        }


def pip_for(pair: str) -> float:
    """Pinned pip constant for a registered pair.

    Raises for any pair outside the frozen six-pair universe (no
    inference from decimal precision, no dynamic fallback).
    """
    try:
        return PIP_CONSTANTS[pair]
    except KeyError:
        raise KeyError(
            f"{pair!r} is not one of the six registered D1 pairs {D1_PAIRS}; "
            "the universe is frozen and may never be extended"
        ) from None


def assess_pair_coverage(
    pair: str,
    *,
    coverage_start: str | None,
    coverage_end: str | None,
    unique_date_count: int | None = None,
    source_documented: bool | None = None,
) -> PairCoverageAssessment:
    """G4 tri-state coverage assessment against the registered slice.

    No numeric minimum is invented. A pair is COVERAGE SUFFICIENT only
    if its documented coverage demonstrably spans the registered
    2010-2025 D1 slice; COVERAGE INSUFFICIENT if it demonstrably does
    not; COVERAGE UNKNOWN when documentation is inadequate (source not
    documented, or no coverage information at all).
    """
    if pair not in D1_PAIRS:
        raise KeyError(f"{pair!r} is not a registered D1 pair")

    if source_documented is False:
        return PairCoverageAssessment(
            pair=pair,
            status=CoverageStatus.UNKNOWN,
            coverage_start=coverage_start,
            coverage_end=coverage_end,
            unique_date_count=unique_date_count,
            reason="source documentation inadequate (G4)",
        )

    if coverage_start is None or coverage_end is None:
        return PairCoverageAssessment(
            pair=pair,
            status=CoverageStatus.UNKNOWN,
            coverage_start=coverage_start,
            coverage_end=coverage_end,
            unique_date_count=unique_date_count,
            reason="no coverage information available",
        )

    missing: list[str] = []
    if coverage_start > D1_SLICE_START:
        missing.append(f"{D1_SLICE_START}..{min(coverage_start, D1_SLICE_END)}")
    if coverage_end < D1_SLICE_END:
        missing.append(f"{max(coverage_end, D1_SLICE_START)}..{D1_SLICE_END}")

    if missing:
        return PairCoverageAssessment(
            pair=pair,
            status=CoverageStatus.INSUFFICIENT,
            coverage_start=coverage_start,
            coverage_end=coverage_end,
            unique_date_count=unique_date_count,
            missing_registered_slice=" and ".join(missing),
            reason="documented coverage does not span the registered 2010-2025 slice",
        )

    if unique_date_count is not None and unique_date_count == 0:
        return PairCoverageAssessment(
            pair=pair,
            status=CoverageStatus.INSUFFICIENT,
            coverage_start=coverage_start,
            coverage_end=coverage_end,
            unique_date_count=unique_date_count,
            reason="registered file contains zero unique dates",
        )

    return PairCoverageAssessment(
        pair=pair,
        status=CoverageStatus.SUFFICIENT,
        coverage_start=coverage_start,
        coverage_end=coverage_end,
        unique_date_count=unique_date_count,
        reason="documented coverage spans the registered 2010-2025 slice; "
        "interior gaps remain a quality-gate matter",
    )


def validate_d1_registry() -> dict:
    """Self-consistency check of the frozen registry (used by tests).

    Returns a deterministic dict: exactly six pairs, pip constants for
    every pair, repo/external partition complete, no overlap.
    """
    problems: list[str] = []
    if len(D1_PAIRS) != 6:
        problems.append(f"universe size is {len(D1_PAIRS)}, must be 6")
    if set(PIP_CONSTANTS) != set(D1_PAIRS):
        problems.append("pip constants do not cover exactly the six pairs")
    if set(REPO_FILES) | set(EXTERNAL_PAIRS) != set(D1_PAIRS):
        problems.append("repo/external partition does not cover the universe")
    if set(REPO_FILES) & set(EXTERNAL_PAIRS):
        problems.append("repo and external pair sets overlap")
    if PIP_CONSTANTS.get("USDJPY") != 0.01:
        problems.append("USDJPY pip must be 0.01")
    four_decimal = [p for p in D1_PAIRS if p != "USDJPY"]
    wrong = [p for p in four_decimal if PIP_CONSTANTS.get(p) != 0.0001]
    if wrong:
        problems.append(f"pairs with wrong 4-decimal pip: {wrong}")
    return {"valid": not problems, "problems": problems}
