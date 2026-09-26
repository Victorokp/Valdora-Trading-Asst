# D1 — Research-History Inventory (Phase 31, factual)

Constructed solely from repository artifacts and commit history
(`d02b9a4…1551f0f`). No reinterpretation; no retroactive relabeling.
UNKNOWN is used wherever the repository does not establish a fact.

## Phase 21 — reconstruction & Golden Reference (`d02b9a4`→`2a46b9f`; closure `438e35e`; experiment `f2de1bc`)

| Category | Items | Evidence |
|---|---|---|
| Directive-specified reconstruction | `phase21_reconstruction.py` (frozen 141-trade engine, 12 unit tests) | commit `e07cd56`, PHASE21_CLOSURE_REPORT.md |
| Exploratory diagnostics | specification recovery, forensic comparison, historical-package verification | `PHASE21_SPECIFICATION_RECOVERY.md`, `PHASE21_FORENSIC_COMPARISON.md` (untracked), `PHASE21_HISTORICAL_PACKAGE_VERIFICATION.md` (untracked) |
| Reconciliation experiment | `phase21_reconciliation_experiment.py` — H1–H5 variant reproducing the 115-trade benchmark byte-identically (SHA `30d22be4…`) | branch commit `f2de1bc` |
| Adopted (as reference, not strategy) | Golden Reference `phase21_historical_reference.py` (byte-copy of the experiment) + verification test | `438e35e`, `tests/test_phase21_historical_reference.py` |
| Final/OOS evaluations | none within Phase 21 (evaluation came later, Phases 28–29) | — |
| UNKNOWN | whether the historical package's generating environment performed result-informed selection before upload (package is self-attested; provenance of `556f9cf` unverifiable) | PHASE21_HISTORICAL_PACKAGE_VERIFICATION.md §6 |

## Phase 27 — research diagnostics & candidate evaluation (`e3162c2`)

| Category | Items | Evidence |
|---|---|---|
| Preregistered experiments | C1 trend-strength, C2 volatility-floor, C4 volatility-ceiling, C5 exit management (pre-registered in PHASE27_EXPERIMENT_REGISTRY.md before evaluation) | registry text; single-run execution |
| Exploratory diagnostics | 27-A baseline, 27-B concentration, 27-C temporal, 27-D regime, 27-F friction curve, 27-G exits, 27-H concurrency, 27-I permutation, 27-J walk-forward | PHASE27_BASELINE_DIAGNOSTICS.md |
| Rejected candidates | C1, C2, C4, C5 (failed pre-registered validation gate) | PHASE27_RESULTS.md |
| Adopted/non-adopted candidate | C3_vol_percentile_floor frozen (passed train+validation gates) but NOT adopted — post-freeze final (+7.00R, PF 1.64) below control final (+10.00R, PF 1.83) | PHASE27_RESULTS.md, PHASE28 §3 |
| UNKNOWN | none material; candidate evaluation order and gates are documented | — |

## Phase 28 — strict OOS/walk-forward validation (`a7279f9`)

| Category | Items | Evidence |
|---|---|---|
| Preregistered experiments | 16-window walk-forward, OOS evaluation, bootstrap (seed 20280926), Monte Carlo (seed 20280927), look-ahead/data audits | PHASE28_SPECIFICATION.md |
| Exploratory diagnostics | regime-conditional OOS description | PHASE28_STATISTICS.md |
| Final/OOS evaluations | OOS 76 trades, +32.2552R, PF 1.8064, 11/16 windows | PHASE28_WALK_FORWARD_VALIDATION_REPORT.md |
| Decision | STATE A (validation supports continuation) | PHASE28_DECISION.md |
| Documented test corrections | two gate-test assertion fixes during the run (rolling-WF overlap; 2019/2022 zero-trade years) — disclosed in the audit | PHASE28_DATA_AUDIT.md narrative |

## Phase 29 — robustness & stress battery (`a3dc35e` + audit reconciliations `f32323a`, `5f1ca8f`, `2011d23`)

| Category | Items | Evidence |
|---|---|---|
| Preregistered experiments | families A–L (execution, delay, exit, parameter, timing, omission, MC order, exposure, drawdown, temporal, regime, cross-pair), frozen in registry before run | PHASE29_EXPERIMENT_REGISTRY.md |
| Exploratory diagnostics | concurrency statistics, drawdown episode structure (descriptive parts of H/I) | PHASE29_ROBUSTNESS_REPORT.md |
| Rejected/corrected reporting | Family-C C2/C3 rows identified as one combined treatment run twice (INVALID as separate experiments); F2 1% count column defect; wording reconciliations | audit notes `f32323a`, `5f1ca8f`, `2011d23` |
| Adopted candidates | none (no Phase-29 candidate existed) | — |
| Decision | STATE A under pre-registered criteria, with material execution-timing fragility explicitly identified (+1 bar +20.04R; +2 bars +2.00R vs control +32.2644R) | PHASE29_DECISION.md |
| UNKNOWN | whether any unrecorded perturbation was considered but not registered (no evidence either way in the repository) | — |

## Phase 30 — external-validation preregistration (`47e8f00`, `3831031`; NOT executed)

| Category | Items | Evidence |
|---|---|---|
| Preregistered (not run) | A1 forward window (PENDING / NOT YET ELIGIBLE, ≥ 60 post-2026-09-25 trading days), A2 independent source, B1–B3 execution realism, C1 conventions, D1 six-pair transfer, E1 failure analysis | PHASE30_EXPERIMENT_REGISTRY.md |
| UNKNOWN | availability/quality of qualifying external data sources (unknowable until obtained) | — |

## Search-space summary (factual)

- Strategy parameters varied across the project's recorded history:
  Phase-27 candidates (5), Phase-29 perturbations (pre-registered grids
  over friction/slippage/delay/exit/EMA/bracket), Phase-21
  reconstruction H-variants (5 axes). No unregistered parameter search
  is documented in any commit.
- Total distinct executed experiment families recorded: Phase 27 (1
  battery + 5 candidates), Phase 28 (validation battery), Phase 29 (12
  families), Phase 31 (8 registered; execution in progress).
- UNKNOWN: any research performed outside this repository's recorded
  commits (e.g., the historical package's pre-upload session) cannot be
  inventoried and remains unquantified.
