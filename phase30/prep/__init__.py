"""Phase-30 inert preparation infrastructure (G1–G4 resolution).

Modules:
- ``constants``      — frozen boundary dates, thresholds, pinned D1 pips.
- ``quality``        — G3 deterministic external-file quality gate.
- ``eligibility``    — G1 qualifying-day counter + A1 eligibility checker + G2 state mapper.
- ``provenance``     — reusable provenance record (task §12 schema).
- ``d1_registry``    — G4 six-pair registry, pip constants, coverage gate.
- ``c1_conventions`` — C1 convention-validation interface (two variants only).
- ``b1_interface``   — B1/B3 deterministic cost-parameter interface.
- ``manifest``       — runtime manifest + registered output-schema validation.

INERTNESS CONTRACT: importing this package performs no research, reads no
market data, writes no files, and opens no network connections. Every
function operates only on data explicitly supplied by its caller.
"""

from phase30.prep import (  # noqa: F401
    b1_interface,
    c1_conventions,
    d1_registry,
    eligibility,
    manifest,
    provenance,
    quality,
)

from phase30.prep.constants import (
    A1_CUTOFF_DATE,
    A1_MIN_QUALIFYING_DAYS,
    A1_SMALL_SAMPLE_TRADES,
    A1_REQUIRED_COLUMNS,
    WARMUP_ROWS,
    B3_LATENCY_OFFSET_PIPS,
    B3_TOTAL_FRICTION_PIPS,
    D1_EXTERNAL_PAIRS,
    D1_PAIRS,
    D1_REPO_FILES,
    D1_SLICE_END,
    D1_SLICE_START,
    PIP_CONSTANTS,
)

__all__ = [
    "A1_CUTOFF_DATE",
    "A1_MIN_QUALIFYING_DAYS",
    "A1_SMALL_SAMPLE_TRADES",
    "A1_REQUIRED_COLUMNS",
    "WARMUP_ROWS",
    "B3_LATENCY_OFFSET_PIPS",
    "B3_TOTAL_FRICTION_PIPS",
    "D1_EXTERNAL_PAIRS",
    "D1_PAIRS",
    "D1_REPO_FILES",
    "D1_SLICE_END",
    "D1_SLICE_START",
    "PIP_CONSTANTS",
    "b1_interface",
    "c1_conventions",
    "d1_registry",
    "eligibility",
    "manifest",
    "provenance",
    "quality",
]
