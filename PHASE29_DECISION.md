# PHASE29_DECISION.md

Phase 29 — Robustness & Stress Testing. Decision document.
The complete evidence is in `PHASE29_ROBUSTNESS_REPORT.md`; the
pre-registered experiment definitions and pass/fail interpretations are in
`PHASE29_EXPERIMENT_REGISTRY.md`.
**This decision language was made logically precise during the Phase-29
independent audit reconciliation (append-only; see §Audit provenance at the
end of this file). No experiment value, seed, result, or preregistration
was altered.**

## Pre-registered decision states (§25)

- **STATE A — SURVIVES**: the strategy retains meaningful evidence under
  reasonable adverse perturbations and no critical implementation
  assumption appears dangerously fragile.
- **STATE B — FRAGILE**: some positive evidence remains but depends
  materially on a narrow set of assumptions or shows substantial
  degradation under reasonable perturbations.
- **STATE C — BREAKS**: reasonable adverse assumptions consistently
  destroy the evidence or the edge depends on an implausibly precise
  implementation condition.

## Assessment against the pre-registered failure definitions (§18)

| Pre-registered failure criterion | Observed |
|---|---|
| Small reasonable perturbation causes catastrophic collapse | No — largest single-experiment deterioration (2-bar delay) leaves +2R, not negative |
| Tiny execution degradation eliminates essentially all edge | No — 6 pips friction / 2 pips slippage still leave +23.1R / +32.2R |
| Small parameter changes produce wildly unstable outcomes | No — PF band 1.36–1.56 across all 12 EMA/bracket neighbors |
| Modest trade omissions reverse the conclusion | No — 0/60 random seeds negative; top-10 removal leaves +12R |
| Realistic exposure restrictions destroy the behavior | No — caps 3/2/1 retain +27.3R to +31.3R with lower maxDD |
| Edge exists only because of one narrow implementation detail | **Partially — one material dependency was found and documented: execution timing** (+1 bar ≈ −38% total R with maxDD −12R → −18R; +2 bars ≈ −94%, +2.00R, PF 1.026). No pre-registered BREAK criterion was triggered, and every *other* tested axis (execution cost, exit degradation, parameter neighborhood, trade omission, exposure caps, temporal/regime breadth) held independently — but the strategy is **NOT robust to execution delay** (see the execution-timing assessment below) |
| Severe drawdown requirements materially inconsistent with practical use | Not triggered — envelope median −9R / p5 −14R; realized −12R is an unfavorable ordering, documented for the owner's risk assessment |
| Hidden dependence on a fragile assumption | One identified and documented: **entry timing** — see the execution-timing assessment below |

## Execution-timing assessment (audit clarification — the material finding)

The strategy is **highly sensitive to execution timing**. This is a
genuine, material sensitivity discovered by the battery, stated plainly:

- A **one-bar delay** removes approximately **38% of total R**
  (+32.2644R → +20.04R; PF 1.489 → 1.286) and **increases max drawdown**
  (−12R → −18R).
- A **two-bar delay** removes approximately **94% of total R** (+2.00R;
  PF 1.026) and leaves the historical result **close to break-even**.
- The pre-registered Family-B trigger was specifically **"FRAGILE if +1
  bar flips negative."** Because +1 bar remained positive, that exact
  pre-registered trigger was **not met**. That is a statement about the
  preregistration, not about the severity of the finding.
- Nevertheless, the **+2-bar result demonstrates a material
  execution-timing fragility.**
- This does **NOT** invalidate the next-open historical test — the
  historical evidence was generated under next-open execution and is
  internally consistent.
- It **does** mean the strategy must **NOT** be described as robust to
  execution delay.

Two distinct robustness questions must not be conflated:

1. **Robustness of the historical evidence** under the pre-registered
   battery: execution cost, exit degradation, parameter neighborhood,
   trade omission, exposure caps, temporal and regime breadth all held
   (see table above), and no pre-registered BREAK criterion triggered.
2. **Robustness of live execution timing**: the edge is concentrated in
   the immediate next-open execution of a short-lived breakout signal;
   a modestly slower execution process erodes it severely.

The decision below answers question 1. It does not answer question 2
favorably.

## DECISION: STATE A under the pre-registered Phase-29 decision criteria,
with a material execution-timing fragility explicitly identified

Rationale, strictly within the pre-registered wording:

1. The evidence survives every pre-registered adverse family with smooth
   degradation: execution cost (0–6 pips), exit-side stress (using the
   corrected audit decomposition — see the robustness report's audit
   note), a ±1-span parameter neighborhood in four indicator parameters,
   targeted and random trade omission (60 seeds), exposure caps 3/2/1,
   and descriptive regime cohorts. No pre-registered BREAK criterion was
   triggered.
2. The multi-position property, the exact EMA spans, the bracket
   multipliers, the gap-fill convention, and the trade ordering can all
   be perturbed without collapsing the evidence. The one dependency that
   is **material and load-bearing** is execution timing, documented in
   the execution-timing assessment above.
3. **Qualification:** **STATE A does not mean the strategy is robust to
   delayed execution. The +2-bar stress nearly exhausts the historical
   edge (+2.00R, PF 1.026).** The decision reflects the pre-registered
   criteria applied to the battery as run; the execution-timing
   fragility is real, material, and documented in the section above.
4. No new pass/fail criterion was invented after seeing the results; the
   distinction recorded here is between *no pre-registered BREAK
   criterion triggered* and *a genuine material sensitivity was
   discovered*. Both statements are true simultaneously.

This does NOT mean the strategy is proven profitable in the future. It
means the historical and OOS evidence survived the falsification attempt
as pre-registered.

## Honest limitations (recorded, not repaired)

- **Execution timing is the dominant practical risk.** Any deployment is
  exposed to signal decay: +1 bar ≈ −38% of total R with higher maxDD,
  +2 bars ≈ −94% (near break-even). Slippage *within* the next-open
  execution was tested and is minor by comparison; a materially slower
  execution process was not and cannot be rescued by the tested cost
  grid.
- Cross-pair evidence remains weak (AUDUSD negative, OOS −16R); EURUSD
  evidence stands alone.
- The mid-volatility cohort carries ~85% of trades; low-volatility
  behavior is unproven (n = 7).
- Drawdown planning should use the Monte Carlo envelope (p1 −17R, worst
  simulated −24.9R), not the realized −12R.

## Gates (§26–27)

- Phase 30 NOT started.
- Golden Reference, Phase-27 candidate C3, Phase-28 OOS results,
  historical ledger: unchanged (hash-gated; `PHASE29_DATA_AUDIT.md`).
- No OOS tuning occurred: every perturbation value and seed was frozen in
  the registry before any experiment ran; no experiment was added, removed,
  re-run with different values, or combined after seeing results.
- All random seeds recorded; outputs byte-deterministic (verified by
  re-run hash comparison, test gate 08).
- All tests green (see `PHASE29_DECISION` companion run in
  `phase29/tests/test_phase29_gates.py`).

## Audit provenance (Phase-29 audit reconciliation, append-only)

- Original Phase-29 results remain frozen at commit
  `a3dc35ee9a51d42dd3c56f239deac9cd60d726e9` (immutable; not amended,
  not rebased).
- The first audit note is commit
  `f32323ad40682756b24a21fbe74e27f7daa4bfaa` (also immutable); this
  decision-language reconciliation is a later append-only commit.
- No Phase-29 result CSV or JSON artifact was regenerated. All committed
  result artifacts are byte-identical to their state at `a3dc35e`.
- The corrected Family-C ledger decomposition was produced by read-only
  analysis of the frozen 115-row ledger; the original C2/C3 CSV rows are
  INVALID as separate stop-only / target-only treatments (one combined
  treatment executed twice) and are superseded as audit evidence by that
  decomposition.
- The F2 1% remaining-trades discrepancy is a reporting-column defect
  only; the actual sampled omission used `k = round(rate × 115)` and all
  R/PF conclusions were computed with the correct k.
- The execution-timing clarification is a wording/interpretation fix, not
  a post-hoc criterion: no new threshold, seed, experiment, or
  preregistration was introduced, and the original pre-registered
  Family-B trigger text is quoted unchanged.
