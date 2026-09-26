# PHASE31_EXPERIMENT_REGISTRY.md

Pre-registration: **every experiment below is frozen BEFORE execution.**
No Phase-31 experiment has been run. Values, seeds, block definitions,
metrics, and output filenames may not be changed after results are seen;
a failed or infeasible experiment is reported as failed/infeasible, not
repaired. Mission, interpretation guards, and contamination controls are
in `PHASE31_SPECIFICATION.md` and are binding.

**Known context carried into every interpretation:** the strategy is
**NOT robust to execution delay** (control +32.2644R; +1 bar +20.04R;
+2 bars +2.00R — Phase 29, documented). This is context, never a target
and never hidden.

---

## Family A — Dependence-aware resampling

### A1 — Fixed-block resampling

- **ID:** A1
- **Question:** How sensitive is the observed result to temporal
  clustering when trades are resampled in predefined chronological
  blocks rather than treated as independent observations?
- **Input (exact file):** `phase21_experiment_results/phase21_trades.csv`
  (SHA-256 verified at run start; the frozen 115-row ledger). Trades are
  used in exit-date order (the ledger's ordering convention).
- **Exact methodology:**
  1. Assign each trade to a block by **exit date**: monthly blocks
     (YYYY-MM), quarterly blocks (YYYY-Qn), calendar-year blocks (YYYY).
  2. Draw resamples by sampling **blocks with replacement** until the
     resample's total trade count first reaches/exceeds 115; truncate
     to exactly 115 trades at the trade level. Within each sampled
     block, the original trade ordering is preserved exactly.
  3. For each resample compute: total R, PF (where defined: gross loss
     ≠ 0), maximum drawdown (cumulative R from 0, exit-order within the
     resample, dd = cum − running max, reported negative), maximum
     losing streak (consecutive R ≤ 0).
  4. Repeat 10,000 times per block definition.
- **Block definitions (exactly three; no others may be added later):**
  monthly, quarterly, calendar-year.
- **Fixed seeds:** monthly `20260926`, quarterly `20260927`, yearly
  `20260928` (each a fresh `numpy.random.default_rng`).
- **Fixed resamples:** 10,000 per block definition (pre-declared; not
  adaptive).
- **Metrics (exactly these):** total R; PF where defined; maximum
  drawdown; maximum losing streak; **P(total R ≤ 0)**; **P(total R ≥
  +32.2644R)** — per block definition.
- **Expected outputs:** `phase31/results/A1_block_resampling.csv` (per
  definition summary + percentile tables),
  `phase31/results/A1_summary.json`.
- **Failure criteria:** none beyond neutral states; INCONCLUSIVE only
  for a documented technical failure (e.g., input hash mismatch stops
  the run before any output).
- **Contamination controls:** ledger + Golden Reference + dataset hash
  gates at run start and end; no block definition, seed, or count may
  change after any output is seen.
- **Type:** descriptive/statistical.

---

## Family B — Null / reference distributions

### B1 — Trade-sign permutation

- **ID:** B1
- **Question:** How unusual is the observed aggregate R when the
  realized trade outcomes are randomly reassigned while preserving the
  observed trade magnitudes?
- **Input:** the frozen 115-trade ledger (hash-gated).
- **Exact methodology:**
  1. Extract the 115 trade R-magnitudes from the frozen ledger.
  2. For each permutation, independently flip each magnitude's sign
     with probability 0.5 (a fair-coin sign randomization preserving
     the magnitude set exactly), then shuffle the signed sequence.
  3. Compute total R, maxDD (as in A1), max losing streak per
     permutation.
  4. Repeat 10,000 times.
- **Fixed seed:** `20260929` (single `default_rng`; no adaptive
  stopping, no reruns).
- **Fixed permutations:** 10,000.
- **Metrics (exactly these):** null total-R distribution (percentiles
  1/5/25/50/75/95/99); observed +32.2644R percentile; **P(null total R
  ≥ observed)**; null maxDD distribution (same percentiles); observed
  −12R percentile.
- **Interpretation guard (pre-registered):** outputs are reported as
  descriptive reference statistics under the stated randomization
  model. They are **not** declared a definitive p-value for the
  strategy; the exchangeability/independence assumptions such a reading
  would require are explicitly examined in E1 and stated as
  limitations.
- **Expected outputs:** `phase31/results/B1_sign_permutation.csv`,
  `phase31/results/B1_summary.json`.
- **Failure criteria:** none beyond neutral states; INCONCLUSIVE only
  for a documented technical failure.
- **Contamination controls:** hash gates; no method variant may be
  introduced after seeing results (multiple-testing rule).
- **Type:** descriptive/statistical.

### B2 — Trade-order permutation evidence (CONSUMPTION ONLY — NO RERUN)

- **ID:** B2
- **Explicit documentation:**
  - Phase 29 already tested random trade ordering: 10,000 permutations,
    seed 20290926, on the identical frozen trade-outcome set — median
    maxDD −9.00R, p5 −14.00R, p1 −17.00R, p95 −6.00R, worst simulated
    −24.911R, P(maxDD worse than −12R) = 12.04%, losing streak p50/p95/
    max = 7/11/21.
  - Phase 31 **consumes that existing evidence** (artifact:
    `phase29/results/phase29_summary.json`, hash-gated) as an input to
    E1's synthesis.
  - **No duplicate experiment is executed.** No rerun, no re-seed, no
    extended iteration count.
- **Expected outputs:** none new (referenced artifact only; its hash is
  re-verified and recorded in the run log).
- **Type:** descriptive (consumption).

---

## Family C — Temporal and concentration structure

### C1 — Return concentration

- **ID:** C1
- **Question:** How concentrated is the +32.2644R result?
- **Input:** frozen ledger.
- **Pre-registered fixed metrics (exactly these; no exclusions, no new
  rule):** contribution of largest winner; top-5 winners; top-10
  winners; share of total gross profit (winners' sum); contribution by
  calendar year; by calendar quarter; by month (all by exit date).
- **Fixed seeds:** none (deterministic).
- **Expected outputs:** `phase31/results/C1_concentration.csv`.
- **Failure criteria:** none (descriptive).
- **Contamination controls:** hash gates; no exclusion rule may be
  derived from output.
- **Type:** descriptive.

### C2 — Winning-cluster structure

- **ID:** C2
- **Question:** What is the streak/cluster structure of outcomes?
- **Input:** frozen ledger, exit-date order.
- **Pre-registered metrics:** longest winning streak (consecutive R > 0)
  and longest losing streak (R ≤ 0); number of winning clusters;
  number of losing clusters; full distribution of consecutive-outcome
  run lengths (win-runs and loss-runs).
- **Fixed seeds:** none.
- **Expected outputs:** `phase31/results/C2_clusters.csv` +
  `phase31/results/C2_summary.json`.
- **Failure criteria:** none (descriptive). **Binding rule:** no
  threshold observed here may be converted into a trading rule.
- **Contamination controls:** hash gates.
- **Type:** descriptive.

### C3 — Drawdown/recovery structure

- **ID:** C3
- **Question:** What is the drawdown and recovery structure of the
  frozen path?
- **Input:** frozen ledger, exit-date order, cumulative R from 0.
- **Pre-registered metrics:** number of drawdown episodes (maximal runs
  of dd < 0); depth of each episode (episode minimum); duration
  (trades) of each episode; recovery duration (trades from trough back
  to prior peak); total time underwater (trades in dd); largest
  recovery requirement (longest recovery duration).
- **Fixed seeds:** none.
- **Expected outputs:** `phase31/results/C3_drawdown_structure.csv`.
- **Failure criteria:** none (descriptive). **Binding rule:** no
  position-sizing change may be derived or tested.
- **Contamination controls:** hash gates.
- **Type:** descriptive.

---

## Family D — Research-history / multiple-testing audit

### D1 — Research-history inventory

- **ID:** D1
- **Question:** What is the factual extent of the research search space
  conducted through Phases 21, 27, 28, 29, and 30?
- **Methodology:** a documentary inventory constructed **only** from
  repository artifacts (registries, reports, decision documents,
  result files, commit history), classified into exactly these
  categories: preregistered experiments; exploratory diagnostics;
  candidate searches; rejected candidates; adopted/non-adopted
  candidates; final/OOS evaluations; descriptive analyses. Each entry
  cites its artifact and commit.
- **Binding rules:** no reinterpretation of historical decisions; no
  retroactive relabeling of any experiment as successful or
  unsuccessful; no new judgment about the quality of past phases.
- **Expected outputs:** `phase31/results/D1_research_inventory.md`
  (committed under `phase31/results/`).
- **Failure criteria:** none (documentary); UNKNOWN entries are used
  wherever the repository does not establish a fact.
- **Contamination controls:** artifact hashes recorded; inventory is
  factual only.
- **Type:** descriptive (documentary).

### D2 — Selection-bias assessment

- **ID:** D2
- **Question:** Was the historical result — or any later conclusion —
  selected after observing the same result?
- **Methodology:** explicit examination of each phase's documented
  process, from repository evidence only: Phase 21 reconstruction (what
  was specified vs recovered); Phase 27 candidate process (C1–C5
  preregistration, single-run evaluation, rejection record); Phase 28
  validation (OOS evaluation after freezing, contamination gates);
  Phase 29 stress tests (pre-registered perturbations, post-hoc
  reporting corrections and their provenance); Phase 30 preregistration
  (design frozen before execution, A1 waiting condition). For each
  phase, record: whether preregistration preceded execution (with
  artifact/commit evidence), whether any result-informed selection
  occurred, and whether the evidence is sufficient to establish the
  fact.
- **Binding rules:** if evidence is insufficient to establish a fact,
  record **UNKNOWN, not PASS**. No numerical "selection-bias score" may
  be invented. Known post-hoc reporting corrections (Phase 29 audit
  notes: Family-C labeling, F2 count column, wording reconciliations)
  are documented **as found**, with their commit provenance, without
  relabeling.
- **Expected outputs:** `phase31/results/D2_selection_assessment.md`.
- **Failure criteria:** none (documentary).
- **Contamination controls:** commit-hash citations for every claim.
- **Type:** descriptive (documentary).

---

## Family E — Statistical evidence synthesis

### E1 — Evidence matrix

- **ID:** E1
- **Question:** What does the combined preregistered evidence —
  dependence-aware, null/reference, concentration, drawdown, and
  research-history — establish, and what does it not?
- **Methodology:** assemble a factual synthesis containing exactly:
  control result (frozen values); dependence-aware results (A1);
  null/reference results (B1 + consumed B2); concentration results
  (C1); cluster structure (C2); drawdown structure (C3);
  research-history findings (D1, D2); known limitations (including the
  Phase-29 execution-timing fragility and Phase-30's pending external
  validation). Assign each synthesis row exactly one neutral state:
  **SUPPORTED / MIXED / LIMITED / INCONCLUSIVE**.
- **Binding rules:** no scores, no rankings, no "best" methods, no
  confidence grades, no strategy ratings. The synthesis must state
  explicitly what each analysis **can** and **cannot** establish. It
  must not declare the strategy "proven", "safe", "guaranteed", or
  future-profitable. Potentially useful modifications discovered during
  any family are recorded only as **FUTURE RESEARCH QUESTION — NOT
  TESTED IN PHASE 31**.
- **Expected outputs:** `phase31/results/E1_evidence_matrix.md`.
- **Failure criteria:** none (synthesis); INCONCLUSIVE applies to rows
  whose inputs failed technically.
- **Contamination controls:** all input artifact hashes re-verified at
  synthesis time and recorded in the matrix.
- **Type:** synthesis (decision-support for the evidence-sufficiency
  question; not a strategy decision).

---

## Execution order (frozen)

**A1 → B1 → C1 → C2 → C3 → D1 → D2 → E1.**

- Each experiment runs **once**; no adaptive branching based on results.
- Phase-29 B2 evidence is referenced/consumed, **never rerun**.
- No additional family, block size, seed, permutation count, metric, or
  variant may be added after this preregistration. If a method produces
  an interesting result, it is recorded — no alternative method may be
  introduced because it would give a different or more favorable
  conclusion (multiple-testing rule).

## Reproducibility requirements (fixed before execution)

- **Environment:** repository `uv` environment; Python/pandas/numpy
  versions recorded into every output JSON at run time (same pattern as
  Phases 28–29).
- **Seeds:** A1 monthly `20260926`, quarterly `20260927`, yearly
  `20260928`; B1 `20260929`; C/D families deterministic (no seeds).
- **Counts:** 10,000 resamples per A1 block definition; 10,000 B1
  permutations (pre-declared, non-adaptive).
- **Exact input files:** `phase21_experiment_results/phase21_trades.csv`
  (frozen ledger); `phase29/results/phase29_summary.json` (B2
  consumption); `phase21_historical_reference.py` (hash gate only);
  `eurusd_d.csv` (hash gate only).
- **Exact metrics & output filenames:** as listed per experiment, all
  under `phase31/results/`; every generated artifact receives a
  registered SHA-256 in `PHASE31_RESULTS.md`.
- **Deterministic rerun:** re-executing the registered code with the
  registered seeds must reproduce byte-identical outputs; a determinism
  gate test is part of the execution-phase test suite.

## Contamination controls (frozen)

**Before execution:** verify (1) Golden Reference
`b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95`,
(2) dataset `e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52`,
(3) historical ledger
`30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`,
(4) **Phase-29 evidence integrity against the already-audited Phase-29
baseline — precise definition:**

- **Immutable, hash-gated against the original Phase-29 experiment
  commit `a3dc35ee9a51d42dd3c56f239deac9cd60d726e9`:** every
  load-bearing experimental artifact — `phase29/phase29_stress.py`,
  `phase29/tests/test_phase29_gates.py`, all stress/result artifacts
  (six root `PHASE29_*.csv` files; `phase29/results/` incl.
  `phase29_summary.json`, `phase29_control_baseline.csv`,
  `phase29_drawdown_stress.json`, `hashes.txt`),
  `PHASE29_EXPERIMENT_REGISTRY.md`, `PHASE29_SPECIFICATION.md`.
- **Permitted at their final reconciled versions from the audited
  Phase-29 documentation commits** `f32323ad40682756b24a21fbe74e27f7daa4bfaa`,
  `5f1ca8f0357f3d810331607ec7406d824de84380`,
  `2011d2385b525be92d5e39fcb214ee44661a7479` — verified against commit
  `2011d23`, not against `a3dc35e`:
  `PHASE29_ROBUSTNESS_REPORT.md`, `PHASE29_DATA_AUDIT.md`, and
  `PHASE29_DECISION.md` (all three at their `2011d23` reconciled
  state). Documentation-only; the audited reconciliations never touched
  any experimental artifact (byte-identity of all experimental
  artifacts against `a3dc35e` was verified at each reconciliation).

(5) Phase-30 preregistration unchanged. **After execution:** repeat all
five checks. Any unexpected change is a **protocol breach — reported,
never silently repaired.**

## Completion rule

Phase 31 completes only after all pre-registered experiments have run,
**or** an explicitly registered experiment is marked LIMITED /
INCONCLUSIVE for a documented data/technical reason. The final report
must distinguish what the evidence demonstrates from what remains
unknown, and must not declare the strategy "proven", "safe",
"guaranteed", or future-profitable.
