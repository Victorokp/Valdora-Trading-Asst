# D2 — Selection-Bias Assessment (Phase 31, factual)

Question: was the historical result — or any later conclusion — selected
after observing the same result? Evidence from repository artifacts and
commit history only. Facts that cannot be established are recorded
**UNKNOWN, not PASS**. No numerical selection-bias score is constructed.

## Phase 21 — reconstruction

- **What the record shows:** the reconstruction target (115 /
  42.6% / 1.49 / +32.26R / −12R) was supplied by the task directives
  *before* the reconstruction; the H1–H5 variant was written once from
  the historical package's documented semantics and reproduced the
  benchmark exactly on first execution, with a byte-identical ledger.
- **Selection after observing the result?** For the *reconstruction
  itself*: no result-informed tuning is recorded — the experiment was
  committed (`f2de1bc`) with the report stating it matched on the first
  run.
- **What cannot be established:** whether the *historical package's
  generating session* selected the strategy or its parameters after
  seeing results before uploading the package. The package is
  self-attested; the claimed provenance commit `556f9cf` is
  unverifiable. → **UNKNOWN** (does not impugn the reproduction, which
  is deterministic and independently repeatable, but the origin of the
  115-trade configuration cannot be certified as unselected).

## Phase 27 — candidate process

- **What the record shows:** five candidates were pre-registered with
  acceptance gates before evaluation; each ran once; four (C1, C2, C4,
  C5) were rejected by the pre-registered validation gate; C3 was
  frozen on train+validation and reported below control on the
  untouched final period; **nothing was adopted**.
- **Selection after observing the result?** No: the candidate set and
  gates precede the runs in the committed registry, and the rejected
  candidates are documented (no silent discarding). The one candidate
  that passed was frozen *before* final evaluation, and the final
  evaluation is reported as-is despite being unfavorable.
- Residual: **the candidate *classes* themselves were chosen by the
  project author at preregistration time; whether that choice was
  itself informed by prior (out-of-repository) observation is
  UNKNOWN.**

## Phase 28 — validation

- **What the record shows:** validation of the *unchanged* control
  after Phase 27's freeze; OOS/walk-forward evaluated post-freeze;
  mechanical contamination gates; two gate-test assertion corrections
  during the run were in the *tests' own expectations* (rolling-WF
  overlap property; zero-trade years) and are disclosed in the audit —
  neither altered any result artifact.
- **Selection after observing the result?** None recorded: no
  strategy, parameter, or interpretation decision was made from OOS
  performance. → evidence supports NO selection, with the caveat that
  the decision to *proceed to Phase 29* was made by the owner after
  seeing STATE A (an owner decision, not a data-selection event).

## Phase 29 — stress battery

- **What the record shows:** all perturbations, seeds, and
  interpretations were frozen in the registry before execution; the
  battery ran once; decision STATE A was assigned under the
  pre-registered states.
- **Post-observation corrections (documented, not relabeled):** the
  Family-C C2/C3 mislabeling (one combined treatment run twice), the
  F2 1% count-column defect, and wording reconciliations were found in
  independent audit and corrected **append-only** with commit
  provenance (`f32323a`, `5f1ca8f`, `2011d23`). No result artifact was
  regenerated; no experiment was re-run with different values. The
  execution-timing fragility was disclosed, not optimized away.
- **Selection after observing the result?** The *experimental values*
  show no selection. The *decision language* was revised after
  observation (STATE A retained with the fragility qualification) —
  recorded as a documented interpretation reconciliation, not as
  result-informed experiment selection. → evidence supports NO
  experiment-level selection; interpretation-level adjustments are
  fully disclosed. Any unrecorded pre-run consideration of perturbation
  values is **UNKNOWN**.

## Phase 30 — preregistration

- **What the record shows:** design frozen before any execution
  (`47e8f00`, corrections `3831031`); A1 has an explicit waiting
  condition (PENDING / NOT YET ELIGIBLE); B1 uses a deterministic
  five-criteria source-selection rule; D1's pair universe is frozen at
  six pairs; C1's variants are mechanically specified.
- **Selection after observing the result?** Not possible yet — nothing
  has executed. The corrections made (`3831031`) tightened definitions
  *before* any data was seen. → evidence supports NO selection;
  execution-phase selection risk remains untested until run.

## Overall

| Phase | Result-selected-after-observation? | Basis |
|---|---|---|
| 21 reconstruction | No (recorded) | single-run byte-identical reproduction; commit order |
| 21 package origin | **UNKNOWN** | self-attested package; unverifiable provenance |
| 27 | No (recorded) | preregistered gates; rejected candidates documented |
| 28 | No (recorded) | post-freeze OOS; contamination gates |
| 29 | No at experiment level (recorded); interpretation reconciled post-hoc with disclosure | append-only audit trail |
| 30 | Not applicable (unexecuted) | design-only commit |

No fact above was upgraded from UNKNOWN to PASS by inference.
