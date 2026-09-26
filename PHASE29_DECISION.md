# PHASE29_DECISION.md

Phase 29 — Robustness & Stress Testing. Decision document.
The complete evidence is in `PHASE29_ROBUSTNESS_REPORT.md`; the
pre-registered experiment definitions and pass/fail interpretations are in
`PHASE29_EXPERIMENT_REGISTRY.md`.

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
| Edge exists only because of one narrow implementation detail | No — every axis tested independently holds; nothing load-bearing found |
| Severe drawdown requirements materially inconsistent with practical use | Not triggered — envelope median −9R / p5 −14R; realized −12R is an unfavorable ordering, documented for the owner's risk assessment |
| Hidden dependence on a fragile assumption | One identified and documented: **entry timing** (1-bar delay −38% of R; 2-bar delay exhausts the edge). The control is a next-open system by construction; this is reported, not repaired |

## DECISION: STATE A — SURVIVES

Rationale, strictly within the pre-registered wording:

1. The evidence survives every pre-registered adverse family with smooth
   degradation: execution cost (0–6 pips), adverse exit slippage and gap
   treatment, a ±1-span parameter neighborhood in four indicator
   parameters, targeted and random trade omission (60 seeds), exposure
   caps 3/2/1, and descriptive regime cohorts.
2. No critical implementation assumption is dangerously fragile: the
   multi-position property, the exact EMA spans, the bracket multipliers,
   the gap-fill convention, and the trade ordering can all be perturbed
   without collapsing the evidence.
3. The one material sensitivity — entry timing — concerns *how the system
   must be executed* (next-open urgency), not whether the historical/OOS
   evidence is an artifact. Per the registry interpretation ("FRAGILE if
   +1 bar flips negative") the +1-bar perturbation did not flip; the
   finding is recorded as documented fragility at +2 bars.

This does NOT mean the strategy is proven profitable in the future. It
means the historical and OOS evidence survived this falsification attempt.

## Honest limitations (recorded, not repaired)

- The entry-timing result means any practical deployment is exposed to
  signal decay; slippage *within* the next-open execution was tested, but
  a materially slower execution process was not and cannot be rescued by
  the tested cost grid.
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
