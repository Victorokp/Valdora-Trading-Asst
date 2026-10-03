"""Phase-30 preparation tests: provenance, B1/B3, C1, manifest, inertness.

The inertness guard (TestInertnessGuard) enforces the task's absolute
rules at the code level: the preparation layer must not import or
execute any frozen research module, must not call GR ``main()`` or
``split_trades`` (32R design rules S8/S9), must not write files, and
must not reference substitute/backdated A1 data.
"""

from __future__ import annotations

import ast
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from phase30.prep.b1_interface import (  # noqa: E402
    B1CostRecord,
    B3_LATENCY_OFFSET_PIPS,
    B3_TOTAL_FRICTION_PIPS,
    CONTROL_FRICTION_PIPS,
)
from phase30.prep.c1_conventions import (  # noqa: E402
    apply_timestamp_shift,
    remove_sunday_bars,
)
from phase30.prep.manifest import (  # noqa: E402
    REGISTERED_OUTPUTS,
    SUMMARY_METRIC_KEYS,
    TRADE_TABLE_COLUMNS,
    RuntimeManifest,
    validate_output,
)
from phase30.prep.provenance import (  # noqa: E402
    ProvenanceRecord,
    build_provenance,
    sha256_bytes,
)


class TestProvenance(unittest.TestCase):
    def test_empty_record_is_honest(self):
        rec = ProvenanceRecord()
        self.assertFalse(rec.registration_ready())
        self.assertIn("sha256", rec.missing_fields())

    def test_full_record_ready(self):
        rec = build_provenance(
            dataset_id="A1-forward",
            instrument="EURUSD",
            timeframe="1d",
            source_provider="provider-name",
            coverage_start="2026-09-26",
            coverage_end="2027-01-04",
            row_count=60,
            unique_date_count=60,
            sha256="a" * 64,
            validation_status="PASS",
            code_version_commit="b1c6d95",
        )
        self.assertTrue(rec.registration_ready())
        self.assertEqual(rec.missing_fields(), [])

    def test_failed_validation_never_ready(self):
        rec = ProvenanceRecord(
            dataset_id="x", instrument="EURUSD", timeframe="1d",
            source_provider="p", coverage_start="a", coverage_end="b",
            row_count=1, unique_date_count=1, sha256="a" * 64,
            validation_status="FAIL", code_version_commit="c",
        )
        self.assertFalse(rec.registration_ready())

    def test_no_field_invention(self):
        with self.assertRaises(ValueError):
            build_provenance(made_up_field="x")

    def test_sha256_bytes_deterministic(self):
        self.assertEqual(sha256_bytes(b"abc"), sha256_bytes(b"abc"))
        self.assertEqual(
            sha256_bytes(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        )


class TestB1Interface(unittest.TestCase):
    def test_empty_record_refuses_friction(self):
        rec = B1CostRecord()
        with self.assertRaises(ValueError):
            rec.friction_pips()
        self.assertEqual(len(rec.failed_criteria()), 5)

    def test_complete_record_yields_single_value(self):
        rec = B1CostRecord(
            provider="documented-broker",
            spread_or_total_identified=True,
            source_page="https://example/source",
            access_date="2026-09-28",
            convertible_to_pips=True,
            spread_pips=0.6,
            commission_pips=0.2,
            single_figure_no_selection=True,
        )
        self.assertEqual(rec.failed_criteria(), [])
        self.assertAlmostEqual(rec.friction_pips(), 0.8)

    def test_no_placeholder_value_at_preparation(self):
        """The interface never yields a friction value from thin air."""
        rec = B1CostRecord(provider="x")
        with self.assertRaises(ValueError):
            rec.friction_pips()

    def test_b3_constants_registered(self):
        self.assertEqual(B3_LATENCY_OFFSET_PIPS, 2.0)
        self.assertEqual(B3_TOTAL_FRICTION_PIPS, 3.5)
        self.assertEqual(CONTROL_FRICTION_PIPS, 1.5)


class TestC1Interface(unittest.TestCase):
    def test_variant1_removes_only_sundays(self):
        rows = [
            {"Date": "2026-10-02"},  # Friday
            {"Date": "2026-10-03"},  # Saturday
            {"Date": "2026-10-04"},  # Sunday
            {"Date": "2026-10-05"},  # Monday
        ]
        r = remove_sunday_bars(rows)
        self.assertEqual(r.rows_removed, 1)
        self.assertEqual(r.removed_dates, ["2026-10-04"])
        self.assertEqual(r.remaining_rows, 3)
        self.assertEqual(len(rows), 4)  # input untouched

    def test_variant2_whole_day_shift(self):
        rows = [{"Date": "2026-10-02", "Close": "1.1"}]
        r = apply_timestamp_shift(rows, declared_offset_hours=24)
        self.assertTrue(r.applied)
        self.assertEqual(r.rows[0]["Date"], "2026-10-03")
        self.assertEqual(r.rows[0]["Close"], "1.1")  # OHLC never altered

    def test_variant2_intraday_offset_is_limited(self):
        r = apply_timestamp_shift([{"Date": "2026-10-02"}], declared_offset_hours=3)
        self.assertFalse(r.applied)
        self.assertIn("LIMITED", r.limited_reason)

    def test_no_third_variant_exists(self):
        import phase30.prep.c1_conventions as m

        public = [n for n in dir(m) if n.startswith(("variant", "VARIANT"))]
        self.assertEqual(sorted(public), ["VARIANT_1", "VARIANT_2"])


class TestManifest(unittest.TestCase):
    def test_nine_registered_outputs(self):
        self.assertEqual(len(REGISTERED_OUTPUTS), 8)  # 8 families
        total = sum(len(v) for v in REGISTERED_OUTPUTS.values())
        self.assertEqual(total, 10)  # 9 artifacts + A2's second file

    def test_trade_table_matches_frozen_ledger_layout(self):
        self.assertEqual(
            TRADE_TABLE_COLUMNS,
            (
                "signal_date", "entry_date", "exit_date", "entry_price",
                "stop_price", "target_price", "exit_price", "atr_at_signal",
                "outcome", "r_multiple", "split",
            ),
        )

    def test_summary_metrics_predeclared(self):
        self.assertEqual(
            SUMMARY_METRIC_KEYS,
            (
                "trades", "wins", "losses", "win_rate", "profit_factor",
                "total_r", "avg_r", "max_drawdown_r", "max_losing_streak",
            ),
        )

    def test_validate_output(self):
        ok = validate_output(
            "A1", "A1_forward_trades.csv", list(TRADE_TABLE_COLUMNS)
        )
        self.assertTrue(ok["valid"])
        bad = validate_output("A1", "unexpected.csv", [])
        self.assertFalse(bad["valid"])
        self.assertFalse(validate_output("E1", "bogus.csv", [])["valid"] or False)

    def test_manifest_roundtrip(self):
        m = RuntimeManifest(
            family="A1",
            code_version_commit="b1c6d95",
            command="python phase30/run_a1.py",
            inputs={"phase30/data/A1.csv": "0" * 64},
            seed=None,
        )
        d = m.to_dict()
        self.assertEqual(d["family"], "A1")
        self.assertIn("phase30/data/A1.csv", d["inputs"])


PREP_DIR = ROOT / "phase30" / "prep"


class TestInertnessGuard(unittest.TestCase):
    """Static enforcement of the preparation layer's absolute rules."""

    FORBIDDEN_IMPORT_FRAGMENTS = (
        "phase21", "phase28", "phase29", "phase31", "forex_",
        "trend_backtest", "yfinance", "ta ",
    )
    FORBIDDEN_CALLS = ("main", "split_trades")
    FORBIDDEN_STRINGS = (
        "simulate_trades", "load_daily(", "eurusd_d.csv",
        "phase21_trades", "requests.", "urllib",
    )

    #: The ONLY permitted open() call sites: read-only hashing/validation.
    PERMITTED_OPEN_SITES = {
        ("provenance.py", "sha256_file"),
        ("quality.py", "_sha256_file"),
        ("quality.py", "validate_external_file"),
    }
    WRITE_MODES = {"w", "a", "x", "+"}

    def _prep_sources(self):
        return sorted(PREP_DIR.glob("*.py"))

    def test_no_frozen_research_imports(self):
        for path in self._prep_sources():
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                mods = []
                if isinstance(node, ast.Import):
                    mods = [a.name for a in node.names]
                elif isinstance(node, ast.ImportFrom) and node.module:
                    mods = [node.module]
                for mod in mods:
                    for frag in self.FORBIDDEN_IMPORT_FRAGMENTS:
                        self.assertNotIn(
                            frag, mod,
                            f"{path.name}: forbidden import {mod!r}",
                        )

    def test_no_gr_execution_or_split_trades(self):
        """Design rules S8/S9: never call GR main() / split_trades."""
        for path in self._prep_sources():
            src = path.read_text(encoding="utf-8")
            for call in self.FORBIDDEN_CALLS:
                self.assertNotIn(
                    f"{call}(", src,
                    f"{path.name}: forbidden call {call}()",
                )

    def test_no_data_execution_or_network_in_prep(self):
        for path in self._prep_sources():
            src = path.read_text(encoding="utf-8")
            for frag in self.FORBIDDEN_STRINGS:
                self.assertNotIn(
                    frag, src,
                    f"{path.name}: forbidden pattern {frag!r} in prep layer",
                )

    def test_open_calls_read_only_and_whitelisted(self):
        """open() exists only in the whitelisted read-only hash/validate
        helpers, never in write/append mode (preparation layer is inert
        apart from hashing a caller-supplied file)."""
        for path in self._prep_sources():
            tree = ast.parse(path.read_text(encoding="utf-8"))

            def is_open_call(node: ast.AST) -> bool:
                return (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name)
                    and node.func.id == "open"
                )

            in_function: set[tuple[str, str]] = set()
            for fn in tree.body:
                if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    for sub in ast.walk(fn):
                        if is_open_call(sub):
                            in_function.add((path.name, fn.name))
                            mode = (
                sub.args[1].value if len(sub.args) > 1 and isinstance(sub.args[1], ast.Constant) else None
                            )
                            if mode and set(str(mode)) & self.WRITE_MODES:
                                self.fail(
                                    f"{path.name}.{fn.name}: write-mode open()"
                                )

            total = sum(1 for node in ast.walk(tree) if is_open_call(node))
            unexpected = {
                (f, name)
                for f, name in in_function
                if (f, name) not in self.PERMITTED_OPEN_SITES
            }
            self.assertFalse(
                unexpected,
                f"open() outside whitelisted read-only sites: {unexpected}",
            )
            # Every open() must live inside a named top-level function
            # (no module-level file I/O):
            self.assertEqual(
                total,
                sum(
                    1
                    for f, name in in_function
                    if f == path.name and (f, name) in self.PERMITTED_OPEN_SITES
                ),
                f"{path.name}: module-level or unaccounted open() call",
            )

    def test_prep_files_have_no_module_side_effects_beyond_definitions(self):
        for path in self._prep_sources():
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in tree.body:
                if isinstance(node, ast.Call):
                    self.fail(f"{path.name}: top-level call {ast.dump(node)[:60]}")
                if isinstance(node, ast.Assign):
                    # Constant definitions are allowed; calls on the
                    # right-hand side are not.
                    for sub in ast.walk(node):
                        if isinstance(sub, ast.Call):
                            self.fail(
                                f"{path.name}: top-level assignment executes "
                                f"a call: {ast.dump(sub)[:60]}"
                            )


if __name__ == "__main__":
    unittest.main()
