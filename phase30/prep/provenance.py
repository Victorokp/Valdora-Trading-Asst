"""Reusable provenance record (task §12 schema).

A provenance record captures everything needed to identify, verify, and
re-acquire a dataset used by any Phase-30 family. Values are NEVER
invented: any field not explicitly supplied stays ``None`` and is listed
by :meth:`ProvenanceRecord.missing_fields`. A record with missing
required fields is not a failure by itself — it is an honest, visible
gap that blocks registration.

INERT: no I/O except the explicit ``sha256_file`` helper.
"""
from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

#: All provenance fields, in report order (task §12).
PROVENANCE_FIELDS = (
    "dataset_id",
    "instrument",
    "timeframe",
    "source_provider",
    "source_url",
    "acquisition_timestamp",
    "source_timezone_convention",
    "coverage_start",
    "coverage_end",
    "row_count",
    "unique_date_count",
    "sha256",
    "validation_status",
    "validation_errors",
    "validation_warnings",
    "code_version_commit",
    "execution_timestamp",
    "seed",
)

#: Fields that must be non-None for the record to be registration-ready.
REQUIRED_FIELDS = (
    "dataset_id",
    "instrument",
    "timeframe",
    "source_provider",
    "coverage_start",
    "coverage_end",
    "row_count",
    "unique_date_count",
    "sha256",
    "validation_status",
    "code_version_commit",
)


def sha256_file(path: str | Path) -> str:
    """SHA-256 of a file, streamed (read-only)."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    """SHA-256 of an in-memory byte string."""
    return hashlib.sha256(data).hexdigest()


def utc_now_iso() -> str:
    """Current UTC timestamp, ISO-8601 (for execution-time capture only —
    never used in eligibility or state decisions)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class ProvenanceRecord:
    """Provenance for one registered dataset file."""

    dataset_id: str | None = None
    instrument: str | None = None
    timeframe: str | None = None
    source_provider: str | None = None
    source_url: str | None = None
    acquisition_timestamp: str | None = None
    source_timezone_convention: str | None = None
    coverage_start: str | None = None
    coverage_end: str | None = None
    row_count: int | None = None
    unique_date_count: int | None = None
    sha256: str | None = None
    validation_status: str | None = None
    validation_errors: list[str] = field(default_factory=list)
    validation_warnings: list[str] = field(default_factory=list)
    code_version_commit: str | None = None
    execution_timestamp: str | None = None
    seed: int | str | None = None

    def missing_fields(self) -> list[str]:
        """Names of REQUIRED fields still unset (never silently filled)."""
        return [name for name in REQUIRED_FIELDS if getattr(self, name) is None]

    def registration_ready(self) -> bool:
        """True iff every required field is present and validation passed.

        A record whose validation status is not a PASS variant is never
        registration-ready (G3: failed quality gates stop the family).
        """
        if self.missing_fields():
            return False
        return str(self.validation_status).startswith("PASS")

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["missing_required_fields"] = self.missing_fields()
        data["registration_ready"] = self.registration_ready()
        return data


def build_provenance(**kwargs: Any) -> ProvenanceRecord:
    """Build a record from explicit inputs only.

    Accepts exactly the provenance field names; unknown keys raise
    (no silent field invention). Omitted fields stay ``None``.
    """
    known = set(PROVENANCE_FIELDS)
    unknown = set(kwargs) - known
    if unknown:
        raise ValueError(f"unknown provenance fields: {sorted(unknown)}")
    return ProvenanceRecord(**kwargs)
