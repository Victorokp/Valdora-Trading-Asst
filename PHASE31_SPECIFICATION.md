# PHASE31_SPECIFICATION.md

Phase: 31 (statistical evidence & dependence audit — **pre-registration
only; no experiment may be executed until this design passes independent
audit review**)
Predecessors: Phase 21 CLOSED (Golden Reference established, historical
ledger byte-identical) → Phase 27 (research diagnostics; no robust
candidate adopted) → Phase 28 (STATE A: validation supports
continuation) → Phase 29 (STATE A under the pre-registered criteria,
**with a material execution-timing fragility explicitly identified**) →
Phase 29 audit reconciliations → Phase 30 preregistered, **not executed**
(families A–E with contamination controls; A1 PENDING / NOT YET ELIGIBLE
until ≥ 60 qualifying trading days exist strictly after 2026-09-25).
Status of this document: **pre-registration only**, per the same protocol
used in Phases 29–30: design first, independent review, then — and only
then — execution.

## 1. Mission

Phase 31 must answer:

> **How strong is the statistical evidence associated with the frozen
> historical result after accounting for temporal dependence,
> clustering, concentration, and the research-selection history —
> without modifying or optimizing the strategy?**

This is an **evidence-audit phase**, not a strategy-development phase.
It must not search for a better parameter, filter, entry, exit, or
market. Every analysis operates on already-frozen artifacts, produces
descriptive/statistical characterizations, and changes nothing about the
strategy or its evidence.

## 2. Immutable control

The Phase-21 Golden Reference is the sole control. Frozen reference
values (from the byte-identical historical ledger):

- 115 trades · 49 wins · 66 losses · 42.6087% win rate
- PF 1.4889 · **+32.2644R** · maxDD −12R

No Phase-31 experiment may rewrite the historical ledger or regenerate a
replacement historical result artifact. Control values are cited as-is;
they are never recomputed as "corrected" figures.

## 3. Evidence categories — five families, exactly

Phase 31 contains five pre-registered families and **no additional
family may be added after this preregistration**:

- **A — Dependence-aware resampling** (A1 fixed-block resampling:
  monthly / quarterly / calendar-year blocks)
- **B — Null / reference distributions** (B1 trade-sign permutation;
  B2 = consumption of the existing Phase-29 order-stress evidence, not
  a rerun)
- **C — Temporal and concentration structure** (C1 return
  concentration; C2 winning-cluster structure; C3 drawdown/recovery
  structure)
- **D — Research-history / multiple-testing audit** (D1 inventory;
  D2 selection-bias assessment)
- **E — Statistical evidence synthesis** (E1 evidence matrix)

## 4. Family definitions (summary — binding details in the registry)

**A1 — Fixed-block resampling.** Resample the frozen 115-trade ledger
in pre-registered chronological blocks (monthly, quarterly, calendar
year), preserving within-block ordering, with fixed seed and 10,000
resamples per block definition. Quantifies sensitivity to temporal
clustering instead of the independent-observation assumption.

**B1 — Trade-sign permutation.** Preserve the frozen magnitude set of
the 115 trades; randomize sign/order per the pre-registered method
(fixed seed, 10,000 permutations, no adaptive stopping). Reports the
null total-R distribution, the observed +32.2644R percentile, P(null ≥
observed), and the null maxDD distribution with the observed −12R
percentile. **Interpretation guard:** this is *not* declared a
definitive p-value for the strategy; the exchangeability assumptions
behind such a reading are themselves part of what the audit examines,
and any limitations are stated in the synthesis.

**B2 — Phase-29 evidence consumption (no rerun).** Phase 29 already
performed trade-order Monte Carlo (10,000 permutations, seed 20290926:
median maxDD −9R, p5 −14R, p1 −17R, worst −24.911R, P(< −12R) =
12.04%). Phase 31 **consumes that existing artifact as an input** to
the synthesis and executes **no duplicate experiment**. This explicit
non-repetition is itself part of the pre-registration.

**C1 — Return concentration.** Largest winner, top-5, top-10, share of
gross profit, contributions by calendar year / quarter / month.
Descriptive; no new exclusion rule.

**C2 — Winning-cluster structure.** Longest winning/losing streaks,
counts of winning and losing clusters, distribution of consecutive
outcomes. Descriptive; no threshold becomes a trading rule.

**C3 — Drawdown/recovery structure.** Episode count, per-episode depth,
duration, recovery duration, time underwater, largest recovery
requirement — from the frozen ledger. No position-sizing optimization.

**D1 — Research-history inventory.** A factual inventory of research
through Phases 21, 27, 28, 29, 30 — separating preregistered
experiments, exploratory diagnostics, candidate searches, rejected
candidates, adopted/non-adopted candidates, final/OOS evaluations, and
descriptive analyses. No reinterpretation of historical decisions; no
retroactive relabeling.

**D2 — Selection-bias assessment.** Documents whether the historical
result or any later conclusion was selected after observing the same
result, examining Phase 21 (reconstruction), 27 (candidate process),
28 (validation), 29 (stress tests), and 30 (preregistration). Facts
that cannot be established from repository evidence are recorded
**UNKNOWN, not PASS**. No numerical "selection-bias score" is invented.

**E1 — Evidence matrix.** Factual synthesis: control result,
dependence-aware results, null/reference results, concentration
results, drawdown structure, research-history findings, known
limitations. Neutral states only — **SUPPORTED / MIXED / LIMITED /
INCONCLUSIVE**. No scores, rankings, "best" methods, confidence
grades, or strategy ratings. The synthesis states explicitly what each
analysis can and cannot establish.

## 5. Multiple-testing rule

Phase 31 must not use its own results to select which statistical
method looks most favorable. All families, block definitions, seeds,
resample counts, and metrics are fixed before execution. If a method
produces an interesting result, it is recorded; no alternative method
may be introduced merely because it would give a different or more
favorable conclusion.

## 6. No-optimization rule

Phase 31 must never alter EMA periods, ATR parameters, stop/target,
add or remove filters, alter entry or exit timing, alter instruments
or position sizing, choose favorable trade subsets, or exclude
inconvenient periods. Any potentially useful modification discovered
is recorded exactly as:

> **FUTURE RESEARCH QUESTION — NOT TESTED IN PHASE 31**

## 7. Reproducibility requirements

The registry fixes before execution: Python environment (repo `uv`
environment, versions recorded at run time in outputs), random seeds
(A1: 20260926, 20260927, 20260928 for monthly/quarterly/yearly; B1:
20260929), resample/permutation counts (10,000 each), exact input
files, exact metrics, output filenames (`phase31/results/…`), and
SHA-256 registration of every generated artifact. Deterministic rerun
must reproduce byte-identical outputs.

## 8. Contamination controls

Before execution: verify (1) Golden Reference hash
`b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95`,
(2) dataset hash
`e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52`,
(3) historical ledger hash
`30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`,
(4) **Phase-29 evidence integrity against the already-audited Phase-29
baseline** — see the precise definition below, and (5)
Phase-30 preregistration unchanged. After execution: repeat all five
checks. Any unexpected change is a **protocol breach, reported as such
— never silently repaired**.

**Phase-29 evidence-integrity gate (precise definition, replacing the
over-broad "byte-identical to `a3dc35e`" wording):**

- **Immutable, hash-gated against the original Phase-29 experiment
  commit `a3dc35ee9a51d42dd3c56f239deac9cd60d726e9`** — the exact
  19-file Tier-1 manifest (every file the audited Phase-29 experiment
  committed; nothing omitted, nothing added):
  1. `phase29/phase29_stress.py`
  2. `phase29/tests/test_phase29_gates.py`
  3. `PHASE29_STRESS_RESULTS.csv`
  4. `PHASE29_EXECUTION_STRESS.csv`
  5. `PHASE29_PARAMETER_SENSITIVITY.csv`
  6. `PHASE29_DRAWDOWN_STRESS.csv`
  7. `PHASE29_TEMPORAL_STRESS.csv`
  8. `PHASE29_REGIME_STRESS.csv`
  9. `phase29/results/PHASE29_STRESS_RESULTS.csv`
  10. `phase29/results/PHASE29_EXECUTION_STRESS.csv`
  11. `phase29/results/PHASE29_PARAMETER_SENSITIVITY.csv`
  12. `phase29/results/PHASE29_TEMPORAL_STRESS.csv`
  13. `phase29/results/PHASE29_REGIME_STRESS.csv`
  14. `phase29/results/phase29_summary.json`
  15. `phase29/results/phase29_control_baseline.csv`
  16. `phase29/results/phase29_drawdown_stress.json`
  17. `phase29/results/hashes.txt`
  18. `PHASE29_EXPERIMENT_REGISTRY.md`
  19. `PHASE29_SPECIFICATION.md`

  (Manifest note: the five `phase29/results/PHASE29_*.csv` entries are
  the results-directory copies committed with the audited experiment;
  they are byte-identical duplicates of their root counterparts and are
  pinned explicitly so no committed experimental artifact escapes the
  gate. `PHASE29_DATA_AUDIT.md`, `PHASE29_DECISION.md`, and
  `PHASE29_ROBUSTNESS_REPORT.md` are NOT in Tier 1 — they are the
  Tier-2 documentation files below.)
- **Permitted to remain at their final reconciled versions from the
  already-audited Phase-29 documentation commits** (`f32323a`,
  `5f1ca8f`, `2011d23`) — verified against commit
  `2011d2385b525be92d5e39fcb214ee44661a7479`, not against `a3dc35e`:
  `PHASE29_ROBUSTNESS_REPORT.md`, `PHASE29_DATA_AUDIT.md`, and
  `PHASE29_DECISION.md` (all three at their `2011d23` reconciled
  state). These are documentation reconciliation files only; their
  audited amendments did not touch any experimental artifact (verified
  byte-identity of all experimental artifacts against `a3dc35e` at each
  reconciliation commit).

## 9. Execution order (frozen)

**A1 → B1 → C1 → C2 → C3 → D1 → D2 → E1.** Phase-29 B2 evidence may be
referenced/consumed but must NOT be rerun. Each experiment runs once.
No adaptive branching based on results.

## 10. Completion rule

Phase 31 completes only after all pre-registered experiments have run,
**or** an explicitly registered experiment is marked LIMITED /
INCONCLUSIVE for a documented data/technical reason. The final report
must distinguish what the evidence demonstrates from what remains
unknown, and must **not** declare the strategy "proven", "safe",
"guaranteed", or future-profitable. The Phase-29 execution-timing
constraint (+1 bar +20.04R; +2 bars +2.00R vs control +32.2644R)
carries forward as documented context: the strategy is **never**
described as robust to execution delay.

## 11. Required files (pre-registration step)

Only:

- `PHASE31_SPECIFICATION.md` (this file)
- `PHASE31_EXPERIMENT_REGISTRY.md`

No `phase31/` directory, results, scripts, notebooks, datasets, or
tests are created at this step; those belong to a later execution phase
after independent audit.
