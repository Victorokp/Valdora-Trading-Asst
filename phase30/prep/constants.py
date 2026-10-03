"""Phase-30 preparation constants.

Sources (authoritative):
- ``PHASE30_EXPERIMENT_REGISTRY.md`` @ ``3831031`` — A1 window/threshold,
  D1 six-pair universe, B3 offset, registered slices.
- ``VALDORA_PHASE30_PROTOCOL_RESOLUTION.md`` — G1–G4 clarifications
  (qualifying-day definition, small-sample mapping, quality gate, pinned
  D1 pip constants + coverage tri-state).

Nothing here is tunable. Any change to a registered value is a protocol
amendment and must go through review, not this file.
"""
from __future__ import annotations

# --- A1 (Family A, external validation; registered window/threshold) ------

#: Historical dataset's last row date. The A1 window is STRICTLY after
#: this date (G1 condition 1). Fixed by preregistration; never derived
#: from today's date.
A1_CUTOFF_DATE = "2026-09-25"

#: Registered minimum: >= 60 qualifying trading days strictly after the
#: cutoff. Fixed; no shorter window may be substituted.
A1_MIN_QUALIFYING_DAYS = 60

#: Registered SUPPORTED rule requires n >= 5 trades (registry, A1 failure
#: criteria). Used by the state mapper; registered rule, unchanged.
A1_SMALL_SAMPLE_TRADES = 5

#: Column contract of the Golden Reference loader (``load_daily``).
A1_REQUIRED_COLUMNS = ("Date", "Open", "High", "Low", "Close")

#: GR warm-up: first 60 rows of the new file get signal zeroed
#: (registered A1 methodology step 2 / phase21 warm-up precedent).
WARMUP_ROWS = 60

# --- G4: pinned D1 pip constants (clarification, 2026-09-28) --------------
# Pinned explicitly; never inferred from observed decimal precision.
# Consistent with the Phase-29 mapping (GBPUSD/AUDUSD 0.0001, USDJPY 0.01)
# and standard 4-decimal quoting for the three additional pairs.
PIP_CONSTANTS = {
    "GBPUSD": 0.0001,
    "USDJPY": 0.01,
    "AUDUSD": 0.0001,
    "NZDUSD": 0.0001,
    "USDCHF": 0.0001,
    "USDCAD": 0.0001,
}

# --- D1 (Family D; UNIVERSE FROZEN at preregistration) ---------------------

#: Exactly six pairs, in registered order. No pair may be added, removed,
#: or replaced — before or after results (registry contamination controls).
D1_PAIRS = ("GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCHF", "USDCAD")

#: Registered per-pair historical files already in the repository
#: (hash-verified before use at execution time).
D1_REPO_FILES = {
    "GBPUSD": "gbpusd_d.csv",
    "USDJPY": "usdjpy_d.csv",
    "AUDUSD": "audusd_d.csv",
}

#: Pairs whose data must be externally acquired and registered
#: (hashed + quality-gated) before any D1 output is generated.
D1_EXTERNAL_PAIRS = ("NZDUSD", "USDCHF", "USDCAD")

#: Registered D1 comparison slices (registry: full-history and
#: 2010-2025 slices). Quoted from the registry — not an invented minimum.
D1_SLICE_START = "2010-01-01"
D1_SLICE_END = "2025-12-31"

# --- B3 (Family B; registered single value) --------------------------------

#: Registered fixed adverse entry offset (registry B3: one value, no sweep).
B3_LATENCY_OFFSET_PIPS = 2.0

#: Registered B3 total entry friction = control 1.5 pips + offset 2.0 pips.
B3_TOTAL_FRICTION_PIPS = 3.5
