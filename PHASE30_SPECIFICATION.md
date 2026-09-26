# PHASE30_SPECIFICATION.md

Phase: 30 (evidence sufficiency assessment — **pre-registration step only**)
Predecessors: Phase 21 CLOSED → Phase 27 (no robust candidate adopted) →
Phase 28 (STATE A: validation supports continuation) → Phase 29 (STATE A
under the pre-registered criteria, **with a material execution-timing
fragility explicitly identified**) → Phase 29 audit reconciliations
(`f32323a`, `5f1ca8f`, `2011d23`).
Status of this document: **pre-registration only. No Phase-30 experiment
may be executed until this design has passed independent review.** The
hard stop after registration is part of the protocol, not an omission.

## 0. Starting constraint carried forward from Phase 29

The Phase-29 battery established, and the audit confirmed, a **material
execution-timing fragility**:

| Execution | Total R | PF | maxDD |
|---|---|---|---|
| Control (next-open) | +32.2644R | 1.489 | −12R |
| +1-bar delay | +20.04R | 1.286 | −18R |
| +2-bar delay | +2.00R | 1.026 | ≈ break-even |

This is a **known constraint**, not a defect to be optimized away. Every
Phase-30 family must be interpreted in its shadow: the historical edge
exists only under prompt next-open execution, so any Phase-30 evidence
about execution realism (Family B) bears directly on whether the edge is
practically attainable at all. No Phase-30 work may alter the strategy to
"fix" this.

## 1. Mission

Phase 29 tested internal perturbations of the frozen system. Phase 30
must answer a different question:

> **What additional evidence is required to determine whether the
> Phase-29 historical edge is sufficiently trustworthy for further
> research, without contaminating the frozen historical evidence?**

Phase 30 is an **evidence-sufficiency assessment**. It does not seek a
better strategy, does not rank configurations, and does not create a
Phase-30 variant. Its deliverable is evidence — or an explicit statement
that the required evidence cannot be obtained in this environment.

## 2. Immutable evidence

These remain frozen for the entire phase. No Phase-30 experiment may
modify them, and no result may be computed in a way that rewrites them:

| Artifact | SHA-256 (frozen) |
|---|---|
| Golden Reference `phase21_historical_reference.py` | `b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95` |
| Historical dataset `eurusd_d.csv` | `e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52` |
| Historical ledger `phase21_experiment_results/phase21_trades.csv` | `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0` |
| Phase-21 reference implementation & closure artifacts | unchanged as of `2011d23` |
| Phase-27 artifacts (`phase27/`, diagnostics, experiments, registry) | unchanged as of `2011d23` |
| Phase-28 artifacts (`phase28/`, WF results, OOS trades/equity, stats, audit, decision) | unchanged as of `2011d23` |
| Phase-29 artifacts (`phase29/`, all root `PHASE29_*` CSVs, reports, decision) | unchanged as of `2011d23` (verified byte-identical to `a3dc35e`) |

Phase-30 outputs live only in new `phase30/` paths and new `PHASE30_*`
root documents. Any external dataset introduced by Family A/C is added
as a **new, separately hashed file**; the historical dataset is never
edited or extended in place.

## 3. No optimization

Phase 30 must NOT:

- tune parameters against OOS results
- search parameter combinations
- select the best configuration
- use OOS performance to improve the strategy
- silently alter execution rules
- retrofit thresholds
- redefine failure criteria after seeing results

If a Phase-30 measurement reveals an apparent improvement opportunity,
it is **recorded and stopped** — it becomes input for a *future,
separately pre-registered* phase, never an in-phase change.

## 4. Separation of evidence categories

Every Phase-30 experiment is classified as exactly one of:

1. **Robustness** — behavior of the frozen system under defined
   perturbations or resampling (new forms, not Phase-29 repeats).
2. **External validation** — evaluation on data outside the historical
   development/evaluation chain (post-dataset history or an independent
   history of the same market).
3. **Implementation validation** — whether the assumed execution model
   can actually be realized (feasibility, latency, convention checks).
4. **Economic realism** — the effect of realistic trading costs,
   spread, and constraints on the *existing* evidence.
5. **Generalization** — whether the same frozen mechanism behaves
   similarly on other instruments, without per-instrument adjustment.
6. **Failure analysis** — characterization of losses/drawdowns,
   descriptive only, never converted into filters.

Mixing categories requires an explicit documented reason in the registry
*before* execution. Descriptive vs decision-bearing status is declared
per experiment.

## 5. What Phase 30 must NOT repeat

Phase 29 already covered, and Phase 30 must not repeat without a clearly
documented methodological reason: friction grids, EMA ±1, bracket ±10%,
random trade omission, concurrency caps, trade-order Monte Carlo, the
same 16 walk-forward windows, the same stress battery. Any reuse of a
Phase-29 construct must justify the incremental information it adds.

## 6. The unresolved questions Phase 30 addresses

1. **Execution realism** — can the next-open assumption actually be
   implemented reliably? How much do realistic spread/slippage/latency
   affect the historical signal?
2. **External validation** — does the behavior survive on data not used
   in the historical development/evaluation chain?
3. **Generalization** — is the evidence EURUSD-specific? If other pairs
   fail, is that a limitation of scope or evidence against the mechanism?
4. **Data sensitivity** — does the conclusion depend on the exact data
   source, OHLC construction, or broker convention?
5. **Economic realism** — what remains after realistic trading costs and
   execution constraints?
6. **Failure structure** — when the strategy loses, can losses be
   characterized without inventing a new filter?

## 7. Experiment families (priority order; full definitions in the registry)

- **Family A — External / untouched validation (highest priority).**
  Obtain genuinely untouched EURUSD data (strictly future-dated relative
  to the historical dataset end 2026-09-25, or an independent source's
  history) under the contamination controls of the registry; evaluate the
  unchanged Golden Reference once, pre-declared metrics only.
- **Family B — Execution realism.** Measure — not repair — the gap
  between the model's next-open+1.5-pip assumption and realistic
  execution: spread models, adverse intra-candle fills, latency proxies,
  next-open feasibility on the actual data, execution-timing sensitivity
  already established in Phase 29 (referenced, not repeated).
- **Family C — Data-source sensitivity.** Same frozen logic on an
  independent EURUSD OHLC source, compared on overlapping history;
  convention differences (bid/ask, GMT vs local stamps, Sunday bars)
  documented before any comparison.
- **Family D — Cross-pair generalization.** Existing unchanged logic on
  additional pairs; descriptive; the Phase-27/29 weak-transfer result is
  the prior, and the question is explicitly whether failure elsewhere
  limits scope or undermines the mechanism.
- **Family E — Failure analysis.** Characterize the 66 stop-outcomes,
  losing clusters, and drawdown episodes of the frozen ledger;
  descriptive; no filter construction.

## 8. Decision states (pre-registered, neutral)

At completion, each family and the phase receive exactly one neutral
state:

- **SUPPORTED** — preregistered evidence obtained and consistent with the
  historical edge being trustworthy for further research on that axis.
- **MIXED** — evidence obtained but internally inconsistent (e.g.,
  positive on one slice, negative on another) without a decisive
  contradiction.
- **LIMITED** — evidence obtained but insufficient in coverage, sample
  size, or data quality to support a judgment.
- **INCONCLUSIVE** — the required evidence could not be obtained (e.g.,
  no uncontaminated external data available in this environment).

An experiment that is **ineligible to execute** under its pre-registered
waiting condition (specifically A1's ≥ 60-qualifying-trading-days
threshold, which had not been reached at pre-registration) is
**PENDING / NOT YET ELIGIBLE** — a registry-defined eligibility status,
not INCONCLUSIVE and not LIMITED. It acquires a decision state only
after it becomes eligible and executes exactly once.

There is no scoring system, no ranking of experiments, no "best"
strategy. The final Phase-30 statement maps the per-family states to a
recommendation about **whether further research is warranted**, nothing
more. The decision depends on preregistered evidence, not post-hoc
preference; failure criteria and interpretation rules below are frozen
with this document.

## 9. Stopping rules

- **Hard stop after pre-registration** (this commit): no experiment is
  run, no data is downloaded, no strategy code is touched until the
  design passes independent audit review.
- After authorization, each family runs **exactly as registered**; a
  family stops when its preregistered outputs exist.
- Any contamination-control breach (Section 10) stops the affected family
  immediately; the breach is reported, not repaired.
- Any attempt to alter immutable evidence stops the phase.

## 10. Contamination controls (binding for all families)

1. External data files are hashed on arrival and registered before use;
   the historical dataset is never modified.
2. External-validation windows are defined by dates **outside** the
   historical dataset's span, declared before any metric is computed.
3. No metric computed on external/future data may feed back into any
   parameter, threshold, filter, or selection decision — there are no
   such decisions registered in Phase 30 at all.
4. Seeds for any stochastic element are fixed in the registry.
5. Every experiment is classified (Section 4) and marked descriptive or
   decision-bearing before execution.
6. All Phase-30 code is additive (`phase30/`); Golden Reference and
   Phase-21..29 artifacts are opened read-only; hash gates run before
   and after every execution (same pattern as Phase 29 gate 01–02).
