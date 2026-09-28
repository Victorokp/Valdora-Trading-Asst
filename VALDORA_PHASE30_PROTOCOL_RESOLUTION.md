# VALDORA_PHASE30_PROTOCOL_RESOLUTION.md

**Status:** Protocol clarification + inert preparation record (authorized G1–G4 resolution step).
**Date of record:** 2026-09-28 · Branch `phase29-stress` · HEAD `b1c6d95022584bacd656ee78bcd770428b4f20e4`
**Scope boundary:** This task resolved the four clarification-level protocol gaps identified by
`VALDORA_FUTURE_RESEARCH_COMPLETENESS_AUDIT.md` §22 and prepared inert execution infrastructure.
**No Phase-30 experiment was executed. No future data was downloaded. No frozen artifact changed.**

---

## 1. Purpose

The future-research completeness audit (32R) established that Phase 30's
preregistration is structurally complete but carries four
clarification-level gaps — G1 (A1 qualifying-day counting unit), G2
(A1 small-sample state mapping), G3 (external-file quality validation),
G4 (D1 pip constants and coverage) — that, unresolved, would force
discretionary interpretation at the exact moment the no-discretion rule
matters most. This document records their explicit resolution, the
classification of each resolution as clarification vs amendment, the
inert preparation infrastructure built to encode the definitions, the
tests proving the infrastructure behaves as specified and remains
inert, and the resulting additional-waiting-period risk picture.

## 2. Authoritative Inputs

All read in full before any change; none modified except the two
authorized append-only addenda (§7):

- `VALDORA_FUTURE_RESEARCH_COMPLETENESS_AUDIT.md` (32R; gap definitions §22, preparation list §21, risks S1–S12 §20)
- `PHASE30_SPECIFICATION.md` @ `3831031` (mission, immutables, contamination controls, decision states)
- `PHASE30_EXPERIMENT_REGISTRY.md` @ `3831031` (A1–E1 registered questions, data, methodology, failure criteria)
- `phase21_historical_reference.py` (Golden Reference; loader column contract, `PIP = 0.0001`, `WARMUP = 60`, `main()`/`split_trades` hazards — 32R S8/S9)
- `phase21_experiment_results/phase21_trades.csv` (frozen ledger; 11-column layout reused as output schema)
- Phase 29 docs/CSVs and `phase29/phase29_stress.py` (PIP save/restore precedent lines 609–634; control +32.2644R; timing fragility)
- Phase 31 spec/registry/execution + corrected-B1 artifacts (`B1_summary_CORRECTED.json`) + E1 evidence matrix (synthesis carry-forward)
- Phase 27 enriched diagnostics (E1 columns: `atr_pctile_100`, `ema20_ema50_gap`, weekly conditions, `exit_year`)
- `VALDORA_APP_ARCHITECTURE.md`, `VALDORA_APP_ARCHITECTURE_PART2.md`, `VALDORA_32B_REPOSITORY_AUDIT.md`, `VALDORA_32C_IMPLEMENTATION.md` (verified: introduce no research requirements — see §12)

Verified repository facts used: dataset ends 2026-09-25 (cutoff);
historical file contains zero Sunday bars (Mon–Fri only); pair files
`gbpusd_d.csv` / `usdjpy_d.csv` / `audusd_d.csv` exist locally (SHA-256
baselined: `e8f7c79d…` / `03f49d95…` / `f23247fd…`); NZDUSD / USDCHF /
USDCAD files absent (external acquisition at D1 execution); A2
independent-source candidate `eurusd_daily.csv` exists in-repo.

## 3. G1 — A1 Qualifying Trading Day

**Resolution (adopted, per authorization):** a calendar date is an A1
qualifying trading day iff (1) strictly later than 2026-09-25; (2) the
registered A1 file contains exactly one valid daily OHLC observation
for that date; (3) OHLC are valid numeric values; (4) the date is part
of the registered file's documented EURUSD daily trading calendar;
(5) the row passes the G3 quality gate; (6) no duplicate date exists —
a duplicated date does NOT qualify and is never deduplicated; (7) not
fabricated/interpolated; (8) not a placeholder/missing-data row.

**Eligibility rule (unchanged threshold/window):** A1 is eligible iff
`count(valid unique qualifying dates strictly after 2026-09-25) >= 60`.
Historical control days never count; the pre-2026-09-26 portion of a
mixed file never counts; the checker never uses today's date.

**Explicitly not a qualifying day:** a Mon–Fri calendar day; a row
existing regardless of validity; a day inferred from another source; a
day created by interpolation. **Explicitly still a qualifying day:** a
valid observed OHLC date with zero signals/trades. Eligibility counts
OBSERVED DAILY OHLC DATES — not candles, signals, trades, wins, or
strategy-active days.

**Classification:** CLARIFICATION — SAFE TO INCORPORATE (defines the
counting unit of the already-registered gate; changes nothing else).

## 4. G2 — A1 Small-Sample State Mapping

**Resolution (adopted, per authorization):** the registered A1 failure
criteria remain authoritative and untouched (SUPPORTED: positive total
R and PF > 1 with ≥ 5 trades; MIXED: positive R but PF ≤ 1 or n < 5;
negative R with ≥ 5 trades = descriptive evidence against persistence;
INCONCLUSIVE only for post-threshold execution failure; PENDING =
pre-threshold status). The previously unmapped cells are now mapped:

| Outcome at eligibility (≥ 60 qualifying days) | State | Handling |
|---|---|---|
| 0 trades | LIMITED | zero trades reported explicitly; no PF, no WR, no zero-valued fabricated metrics; no success/failure claim from absence of trades |
| total R negative, n < 5 | LIMITED | exact n and exact total R reported; not a decisive failure; no strategy modification; no rerun with alternative filters |
| other explicitly documented small-sample condition | LIMITED | condition documented in the results file |

No new positive criterion exists; a small sample never becomes a
positive conclusion. Rationale: ~60 days × the historical signal rate
(~49 signals / 5,914 days) ≈ 0–1 expected signals, so small-n is the
*expected* regime, not a tail.

**Conflict check performed:** the registry's MIXED rule ("positive R
but PF ≤ 1 **or n < 5**") already maps positive-small-n → MIXED; the
clarification therefore fills only the zero-trade and negative-small-n
cells and does not override the registered mapping. No conflict found;
nothing required reclassification as PROTOCOL GAP — REQUIRES REVIEW.

**Classification:** CLARIFICATION — SAFE TO INCORPORATE.

## 5. G3 — External Data Quality Gate

**Resolution (adopted, per authorization):** every external dataset
registered for A1, A2, C1, D1 (and B1 if an external file is ever
involved) passes a deterministic quality gate BEFORE the family
executes. Implemented in `phase30/prep/quality.py`:

- **File-level:** exists; readable; non-empty; SHA-256 captured;
  coverage start/end captured; schema (column inventory) documented.
  (Source identity / acquisition timestamp / URL / timezone convention
  are provenance fields — §11 — required for registration, not
  computable from the file.)
- **Row-level:** date parses; OHLC present and numeric; High ≥
  max(Open, Close); Low ≤ min(Open, Close); High ≥ Low; no impossible
  (≤ 0) prices; duplicate dates counted and flagged; duplicate-date
  rows never silently deduplicated; file-order sortedness checked;
  weekday-date gaps inside claimed coverage listed (never filled);
  weekend-dated rows flagged (C1-relevant); weekday distribution
  reported.
- **Hard failures** (unreadable/empty/mis-schemaed files, duplicate
  dates, missing/non-numeric OHLC, impossible values, OHLC-logic
  violations) → gate FAIL → affected family does not execute; issue
  reported; source file preserved unchanged.
- **Warnings** (weekday gaps = potential holidays; weekend rows;
  out-of-order rows) are reported and adjudicated in the results file,
  never repaired: legitimate market-calendar gaps cannot be
  distinguished from defects without an external holiday calendar.
- **No repair ever:** no deduplication, no interpolation, no filling.

**Classification:** CLARIFICATION — SAFE TO INCORPORATE (a
validation/control inside contamination control §10.1; not a new
research test).

## 6. G4 — D1 Pip and Coverage Conventions

**Resolution (adopted, per authorization):**

**(a) Pinned pip constants** (never inferred from observed decimal
precision; consistent with the Phase-29 mapping and the GR constant
`PIP = 0.0001`): GBPUSD 0.0001 · USDJPY 0.01 · AUDUSD 0.0001 ·
NZDUSD 0.0001 · USDCHF 0.0001 · USDCAD 0.0001.

**(b) Minimum coverage:** no arbitrary numeric threshold was invented
(the preregistration specified none). External pair files are assessed
with the tri-state convention against the **registered** 2010–2025 D1
slice: COVERAGE SUFFICIENT (documented coverage demonstrably spans the
slice) / COVERAGE INSUFFICIENT (demonstrably does not) / COVERAGE
UNKNOWN (source documentation inadequate). An
unavailable/insufficient pair takes the registered
UNAVAILABLE/LIMITED path and is never substituted, added, or removed.
The absence of a numeric minimum is thereby documented as a deliberate
tri-state convention, not a hidden gap.

**Classification:** CLARIFICATION — SAFE TO INCORPORATE (pins values
consistent with existing precedent; changes no registered rule).

## 7. Clarification vs Amendment Classification

| Gap | Proposed resolution | Changes research question? | Changes data? | Changes strategy logic? | Changes metric? | Changes decision rule? | Classification |
|---|---|---|---|---|---|---|---|
| G1 | Qualifying-day definition + count rule (threshold/window unchanged) | No | No | No | No | No — defines the unit of the already-registered gate | CLARIFICATION — SAFE TO INCORPORATE |
| G2 | Maps 0-trade and negative-small-n outcomes to LIMITED; registered criteria untouched | No | No | No | No | No — fills unmapped cells with existing neutral state | CLARIFICATION — SAFE TO INCORPORATE |
| G3 | Registration-time quality gate; report-only warnings; no repair | No | No (gates, never repairs) | No | No | No — validation/control inside §10.1 | CLARIFICATION — SAFE TO INCORPORATE |
| G4 | Pinned pips (P29-consistent) + tri-state coverage convention | No | No | No | No | No — pins unstated constants | CLARIFICATION — SAFE TO INCORPORATE |

All four preserve the preregistered research; none was forced. The
classification table is also recorded in the appended specification
appendix (§11 of `PHASE30_SPECIFICATION.md`).

## 8. Protocol-Gap Review Items

**None remain open.** G1–G4 were classified as genuine clarifications
and incorporated via the authorized append-only addenda:

- `PHASE30_SPECIFICATION.md` — new "## 11. Protocol clarifications
  (2026-09-28) — G1–G4" appendix (143 lines appended; `git diff`
  confirms 143 insertions, 0 deletions; original text byte-unchanged).
- `PHASE30_EXPERIMENT_REGISTRY.md` — new "## Addendum: protocol
  clarifications G1–G4 (2026-09-28)" (58 insertions, 0 deletions;
  original text byte-unchanged).

Both appends are labeled PROTOCOL CLARIFICATION with date and
rationale, preserve the original preregistration history, and alter no
unrelated methodology. Pre-addendum baselines recorded for the record:
spec `ab332a4ae92ea9306e151…`, registry `f7487337de0e02623c32a55be2a5a…`.
A G2 conflict check against the registered MIXED rule found no
override situation (§4). Should any future conflict between the
clarifications and the original registry text be discovered, the
original text governs and the conflict is referred for review.

## 9. Prepared Inert Infrastructure

New package `phase30/` — additive, executes no research, imports no
frozen research module:

| Module | Encodes | Key behavior |
|---|---|---|
| `phase30/prep/constants.py` | G1/G2/G4 registered values | cutoff 2026-09-25; ≥ 60 days; n < 5; WARMUP 60; B3 2.0/3.5 pips; D1 pairs + pips; slices |
| `phase30/prep/eligibility.py` | G1 + G2 | `count_qualifying_days`, `check_a1_eligibility` (boundary enforcement, no clock use, duplicates surfaced not deduplicated), `map_a1_state` (registered rules + G2 fill-ins) |
| `phase30/prep/quality.py` | G3 | `validate_external_file` → deterministic `QualityReport` (hard fails vs warnings, zero repair) |
| `phase30/prep/d1_registry.py` | G4 | frozen six-pair registry, pinned pips (`pip_for` rejects outsiders), tri-state `assess_pair_coverage`, `validate_d1_registry` |
| `phase30/prep/provenance.py` | §12 schema | `ProvenanceRecord` (18 fields, required subset, no field invention, never registration-ready on failed validation), `sha256_file/bytes` |
| `phase30/prep/c1_conventions.py` | C1 (two variants only) | `remove_sunday_bars` (V1), `apply_timestamp_shift` (V2; non-day offsets → registered LIMITED path; OHLC never altered) |
| `phase30/prep/b1_interface.py` | B1/B3 | `B1CostRecord` with the five registered criteria; refuses to yield a friction value until all are satisfied (LIMITED/no-execution path is explicit); B3 constants |
| `phase30/prep/manifest.py` | runtime manifest + schemas | `RuntimeManifest`; `REGISTERED_OUTPUTS` (all 8 families); 11-column trade-table schema = frozen ledger; `validate_output` structural check |

Design rules adopted (32R S8/S9, statically enforced by tests): never
call GR `main()` (writes to the frozen ledger path) or `split_trades`
(fixed-date asserts); import nothing from research modules;
`open()` permitted only inside whitelisted read-only hash/validate
helpers; no module-level I/O. There is no `phase30/data/` and no
`phase30/results/` — both appear only at authorized execution.

## 10. Test Coverage

`uv run python -m unittest discover -s phase30/tests -t .` → **66 tests, all passing** (4 files):

- `test_phase30_prep_eligibility.py` (21): the twelve required A1
  eligibility cases — 59 days PENDING; 60 eligible; 60+1 duplicate
  flagged and non-qualifying; invalid OHLC excluded; 0 trades →
  LIMITED; 1 negative → LIMITED; 4 negative → LIMITED; 5 trades →
  registered SUPPORTED/MIXED/EVIDENCE_AGAINST logic; 59 future + 100
  historical → PENDING; 60 future days after cutoff → eligible; 60
  calendar dates without OHLC → not qualifying; duplicates never
  silently deduplicated — plus boundary tests (cutoff date rejected,
  pre-cutoff rejected, first eligible day 2026-09-26, no today's-date
  dependence) and G2 grid cases.
- `test_phase30_prep_quality.py` (12): valid file passes; duplicate
  dates fail; missing OHLC fails; impossible values fail; OHLC-logic
  violation fails; missing columns fail; empty/nonexistent fail;
  out-of-order warns; holiday gaps surfaced never filled; weekend rows
  warned; report determinism.
- `test_phase30_prep_d1.py` (10): six and only six pairs; pip
  constants exactly as specified; USDJPY 0.01; other five 0.0001;
  missing pair never substituted (KeyError); registry self-consistency;
  SUFFICIENT/INSUFFICIENT/UNKNOWN coverage; malformed external file
  fails validation.
- `test_phase30_prep_infra.py` (23): provenance honesty (missing
  fields never filled; failed validation never registration-ready; no
  field invention; SHA-256 vectors); B1 interface (empty record
  refuses; complete record yields single value; no placeholder at
  preparation; B3 constants); C1 (V1 Sunday-only removal, input
  untouched; V2 whole-day shift preserving OHLC; intraday offset →
  LIMITED; no third variant); manifest schemas (11-column ledger
  layout; pre-declared metric keys; family output validation);
  **inertness guard** (no frozen-research imports; no `main()`/
  `split_trades` calls; no network/data-execution patterns; open()
  only in whitelisted read-only helpers; no module-level side effects).

Existing suites re-run after all changes — all green, untouched:
`tests/` 15 OK · `phase27/tests` 6 OK · `phase28/tests` 9 OK ·
`phase29/tests` 10 OK · `phase31/tests` 9 OK.

## 11. Provenance Schema

`phase30/prep/provenance.py` implements the required reusable record —
dataset identifier; instrument; timeframe; source/provider; source URL;
acquisition timestamp; source timezone/convention; coverage start;
coverage end; row count; unique-date count; SHA-256; validation status;
validation errors/warnings; code version/commit; execution timestamp;
seed. Required-for-registration subset enforced; missing fields are
reported, never invented; failed validation blocks registration;
unknown keys raise. Values are populated only at registration/execution
time from documented sources — none are invented here.

## 12. Future Execution Boundary

- **Nothing executes automatically.** Every prep function is inert
  until a caller supplies data; no module performs I/O at import.
- A1 executes only after the G1 gate passes on a registered,
  quality-gated file; the checker never uses today's date; the boundary
  is fixed at 2026-09-25.
- Runners (when separately authorized) must follow 32R S8/S9: import GR
  functions only with module-constant overrides (phase29 precedent),
  never run `main()`, never call `split_trades`.
- Output artifacts: exactly the nine registered outputs (§9 manifest
  schemas); no additional metric may be added after seeing output.
- The application layer (32B/32C/32A docs) was cross-checked: it
  prescribes no research requirement; the Research Viewer (32H) will
  only *display* frozen results via a ResearchService. No
  architecture-driven research obligation exists.

## 13. Additional-Waiting-Period Risk Review

**Question:** if A1 became eligible tomorrow, is there any known
methodological clarification, calculation, validation, provenance,
schema, or integrity prerequisite that would force another calendar
waiting period?

**Answer: no known avoidable waiting risk remains.** Distinctions:

- **No known avoidable waiting risk:** G1–G4 (the audit's S1–S3) are
  resolved; S8/S9 design rules are enforced by tests; runner blueprint,
  provenance/schema machinery, and gate scripts exist.
- **Future-data dependency (calendar, not defect):** the ≥ 60
  qualifying days themselves; D1's three external pair files (GBPUSD/
  AUDUSD/USDJPY already in-repo); B1's cost snapshot at execution;
  C1-V2 convention documentation (V2 LIMITED is the registered terminal
  path, not a wait).
- **Unresolved genuine protocol gap:** none.
- **Source-acquisition risk:** D1 external pairs and (if the in-repo
  candidate were rejected) A2 — but every such failure lands in a
  registered terminal state (UNAVAILABLE/LIMITED/INCONCLUSIVE), not in
  a second wait.
- **Execution-time failure risk:** a malformed registered file fails
  the G3 gate *before* execution and is reported, not repaired — a
  controlled stop, not a calendar pause. Environment drift by execution
  time (32R S10) is mitigated by pinned `uv.lock` + the established
  determinism re-verification pattern.

## 14. Integrity Verification

**Before work:** Golden Reference `b0d84b15…e95` ✓ · dataset
`e0676d92…d52` ✓ · ledger `30d22be4…d0` ✓ · HEAD `b1c6d95…` on
`phase29-stress` ✓.

**After work (re-verified):** the same three hashes byte-identical ✓.
Full manifest gate rebuilt from the actual manifest-commit trees
(previous gate list contained outdated names from condensed notes; the
rebuilt gate uses the files each commit verifiably contains):
**PASS=40, FAIL=7 — all 7 accounted for by authorized supersession**:
3 Phase-29 docs (superseded by the `2011d23` reconciliation — pass
there), 2 Phase-30 docs (today's authorized clarifying append —
pre-change baselines recorded in §8), 2 Phase-31 files (superseded by
the `b1c6d95` E1 closure — pass there). `git diff` spot-arbitration
against `a3dc35e`/`2011d23`/`76e9c3e` confirmed empty (identical) for
the failed-name probes. Corrected B1 artifact hashes match the
authorized values (`a2fc3db3…` / `7f0d215e…` / `50f3dd9f…`). Pre-existing
untracked P21 files re-hashed unchanged. No frozen artifact was
regenerated or modified.

## 15. Git/Working-Tree Impact

- **Created:** `VALDORA_PHASE30_PROTOCOL_RESOLUTION.md` (this file);
  `phase30/` package (`__init__.py`; `prep/` 8 modules + `__init__.py`;
  `tests/` 4 test files + `__init__.py`).
- **Modified (append-only, authorized):** `PHASE30_SPECIFICATION.md`
  (+143/−0), `PHASE30_EXPERIMENT_REGISTRY.md` (+58/−0). Pre-existing
  modification from 32C unchanged: `.gitignore`.
- **Untouched:** all research code, data, ledgers, results, phase
  21/27/28/29/31 artifacts; both pre-existing untracked P21 reports;
  the application subtree (`src/`, config files) and the 32A/32B/32C/
  32R reports.
- No commit, no push. The Changes panel remains the delivery path.

## 16. Final Status

- **Resolved:** G1, G2, G3, G4 — all classified CLARIFICATION — SAFE
  TO INCORPORATE; recorded in the two append-only Phase-30 addenda.
- **Unresolved:** nothing. No PROTOCOL GAP — REQUIRES REVIEW item
  remains open.
- **Prepared:** the inert `phase30/prep/` layer (8 modules) + 66
  passing unit tests, including the twelve mandated eligibility cases
  and the static inertness guard.
- **NOT executed:** A1, A2, B1, B2, B3, C1, D1, E1. No future data
  downloaded, no substitute data used, no A1 result simulated.
- **Protocol amendment occurred:** no methodology, metric, decision
  rule, threshold, or window changed. The only preregistration-file
  changes are the two labeled clarification appendices authorized by
  this task; the original preregistration text is byte-identical and
  its history preserved.
- **A1 status:** unchanged — **PENDING / NOT YET ELIGIBLE**, waiting
  for the genuine ≥ 60-qualifying-trading-day gate strictly after
  2026-09-25.

*End of report.*
