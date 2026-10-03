"""Runtime manifest + registered output-schema validation.

Prepares the runtime manifest (inputs + hashes, code identity, command,
pre/post integrity results, artifacts + hashes, state assigned) and the
column layouts of the nine registered output artifacts. Schemas mirror
the registry exactly; ``validate_output`` checks structure only - it
never fabricates values.

INERT: no I/O except reading nothing; all data is caller-supplied.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ---------------------------------------------------------------- schemas -

#: A1/A2 per-trade table: the 11-column frozen ledger layout.
TRADE_TABLE_COLUMNS = (
    "signal_date", "entry_date", "exit_date", "entry_price", "stop_price",
    "target_price", "exit_price", "atr_at_signal", "outcome", "r_multiple",
    "split",
)

#: Registered output artifacts (registry "Expected outputs" sections).
REGISTERED_OUTPUTS = {
    "A1": ("A1_forward_trades.csv", "A1_forward_summary.json"),
    "A2": ("A2_independent_trades.csv", "A2_independent_summary.json"),
    "B1": ("B1_cost_summary.json",),
    "B2": ("B2_gap_audit.csv",),
    "B3": ("B3_latency_summary.json",),
    "C1": ("C1_conventions.csv",),
    "D1": ("D1_transfer_table.csv",),
    "E1": ("E1_failure_analysis.csv",),
}

#: Pre-declared summary metric keys (registry "pre-declared metrics").
SUMMARY_METRIC_KEYS = (
    "trades", "wins", "losses", "win_rate", "profit_factor",
    "total_r", "avg_r", "max_drawdown_r", "max_losing_streak",
)


@dataclass
class RuntimeManifest:
    """Deterministic runtime manifest for one Phase-30 family run."""

    family: str
    code_version_commit: str | None = None
    command: str | None = None
    inputs: dict = field(default_factory=dict)          # path -> sha256
    environment: dict = field(default_factory=dict)     # frozen versions
    seed: int | str | None = None
    pre_integrity: dict = field(default_factory=dict)
    post_integrity: dict = field(default_factory=dict)
    artifacts: dict = field(default_factory=dict)       # path -> sha256
    state_assigned: str | None = None

    def to_dict(self) -> dict:
        return {
            "family": self.family,
            "code_version_commit": self.code_version_commit,
            "command": self.command,
            "inputs": dict(self.inputs),
            "environment": dict(self.environment),
            "seed": self.seed,
            "pre_integrity": dict(self.pre_integrity),
            "post_integrity": dict(self.post_integrity),
            "artifacts": dict(self.artifacts),
            "state_assigned": self.state_assigned,
        }


def validate_output(family: str, artifact: str, columns: list[str]) -> dict:
    """Structural validation of a future artifact against its schema.

    Returns a deterministic dict with ``valid`` and ``problems``. No
    content is inspected beyond column names; no value is invented.
    """
    problems: list[str] = []
    expected = REGISTERED_OUTPUTS.get(family)
    if expected is None:
        problems.append(f"unknown family {family!r}")
    elif artifact not in expected:
        problems.append(
            f"{artifact!r} is not a registered output of family {family} "
            f"(expected: {list(expected)})"
        )
    if artifact.endswith("_trades.csv"):
        missing = [c for c in TRADE_TABLE_COLUMNS if c not in columns]
        if missing:
            problems.append(f"trade table missing ledger columns: {missing}")
    return {"valid": not problems, "problems": problems}
