# PHASE31_B1_CORRECTION_PROTOCOL.md

## PROTOCOL STATUS

**B1 CORRECTION PREREGISTERED — NOT YET EXECUTED.**

This document preregisters a single corrective rerun of the Phase-31 B1
(trade-sign permutation) experiment. Nothing in this document is executed
by its creation. No result file is created. The corrected B1 artifacts
listed in §6 do not exist yet; they may be produced only by the future,
separately recorded corrective execution described here.

## 1. Purpose and evidence-chain references

The original Phase-31 B1 execution deviated from the frozen
preregistration: it independently randomized each trade magnitude's sign
exactly as registered, but it **failed to shuffle the resulting signed
sequence** before computing the order-dependent metrics (maxDD and
maximum losing streak). The frozen registry
(`PHASE31_EXPERIMENT_REGISTRY.md`, B1 §"Exact methodology", as committed
at `1551f0fe2efc4bab8b02ac412a51d03a3524e8fa`) required:

> sign randomization → shuffle signed sequence → calculate total R,
> maxDD and losing streak.

Therefore the original B1 maxDD and losing-streak outputs are **not
valid representations of the preregistered B1 experiment**. This
protocol is the preregistration of exactly one corrective B1 rerun that
reproduces the frozen method — sign randomization **then shuffle** —
with the same frozen seed and permutation count.

Evidence-chain references:

- Original Phase-31 execution commit (preserved exactly, immutable):
  `76e9c3eab3a179dd6d21c5556c74d97a9fa451a0`
- Forensic correction commit (documented the B1 deviation and the C3
  reconciliation, append-only):
  `6c95d0123db7af028c1cbdca28619d361ce7746d`
- This correction protocol's commit: the commit that adds
  `PHASE31_B1_CORRECTION_PROTOCOL.md` to `phase29-stress` with the
  message "Phase 31: preregister B1 corrective rerun" (SHA to be read
  from the git log of this branch; the document is committed once and
  never amended).

## 2. Validity statement (binding wording)

The original B1 execution remains part of the historical Phase-31
evidence record. Its total-R result may be described as order-invariant
sign-randomization evidence, but its maxDD and losing-streak results are
not valid for the frozen B1 protocol because the required shuffle was
omitted.

Specifically:

- **Total R is order-invariant** (a sum of independently sign-flipped
  magnitudes does not depend on sequence order). The original B1
  total-R outputs — null percentiles, the observed +32.2644R at the
  97.75th percentile, and P(null total R ≥ observed) = 2.25% — are
  valid draws from the preregistered total-R null and remain usable.
- **maxDD and maximum losing streak are order-dependent.** Because the
  shuffle was omitted, the original B1 maxDD/streak outputs (including
  the reported observed maxDD percentile 80.34) describe random signs
  in fixed positions, not the preregistered shuffled model, and must
  not be used as B1 evidence.

This is a **methodological execution deviation**, not evidence for or
against the trading strategy. The original run is not called "wrong" in
any strategy-level sense.

## 3. Scope guards (append-only, minimal)

- The **original B1 artifacts are preserved** exactly as produced:
  `phase31/results/B1_sign_permutation.csv`,
  `phase31/results/B1_summary.json`, and the B1 block of
  `phase31/results/phase31_runtime_log.json` are not modified,
  overwritten, regenerated, or deleted. They stay byte-identical to
  commit `76e9c3eab3a179dd6d21c5556c74d97a9fa451a0`.
- This is a **corrective rerun, not the original preregistered
  execution**. It is distinguished from it by output naming (§6) and by
  the execution record required in §7. The original B1 outputs remain
  part of the historical evidence record; they are superseded — only
  for the maxDD/streak metrics — by the corrected outputs when those
  exist.
- **No other Phase-31 family is being rerun.** A1, B2 (consumption),
  C1, C2, C3, D1, D2, and E1 are not touched by this protocol. The C3
  reconciliation already documented at `6c95d01…` is not re-opened.
- No Phase-29 or Phase-30 artifact is modified; the Golden Reference
  `phase21_historical_reference.py` and the historical ledger are not
  modified. No merge to `main`. No Phase 32 or Phase 33 is started by
  this protocol.

## 4. Corrected B1 method (frozen before execution)

The correction reproduces the frozen preregistered B1 method exactly:

**Input (exact file):** `phase21_experiment_results/phase21_trades.csv`
— the frozen 115-trade ledger (SHA-256
`30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`),
verified at run start and run end.

**Fixed seed:** `20260929` — a single
`numpy.random.default_rng(20260929)` governs the prescribed procedure.
No other RNG is introduced.

**Fixed permutation count:** exactly 10,000. Not adaptive; no reruns.

**Exact operation order (for each of the 10,000 permutations):**

1. Extract the absolute/magnitude component of each of the 115 trade R
   values from the frozen ledger (magnitude set preserved exactly).
2. Independently flip each magnitude's sign with probability 0.5 using
   the single RNG above (`numpy.random.default_rng(20260929)`).
3. Take the resulting 115 signed values.
4. **Shuffle that signed sequence.** (This is the step the original
   execution omitted; it is mandatory here.)
5. Calculate, on the shuffled signed sequence:
   - total R
   - maximum drawdown (cumulative R from 0 in the shuffled order;
     dd = cum − running max; reported negative)
   - maximum losing streak (consecutive R ≤ 0 in the shuffled order)

**Explicitly forbidden (no new methods, no result-informed choices):**
no second RNG or alternate RNG stream; no bootstrap sampling; no
resampling of magnitudes; no change to the number of observations (115
per permutation); no change to the sign probability (0.5); no change to
the order of operations above; no alternative seeds; no alternative
permutation counts; no alternative null models; no p-value corrections;
no confidence intervals; no additional tests; no parameter searches.
The observed result must not be used to choose any method, metric, or
threshold (multiple-testing rule, as binding in Phase 31).

## 5. Fixed output metrics (exactly the preregistered B1 metrics)

**Null total-R distribution** — percentiles: 1, 5, 25, 50, 75, 95, 99.

**Observed total-R reference:**
- observed control: `+32.2644R`
- percentile of the observed result in the null distribution
- `P(null total R >= observed)`

**Null maxDD distribution** — percentiles: 1, 5, 25, 50, 75, 95, 99.

**Observed maxDD reference:** the percentile corresponding to the
observed `−12R`.

**Interpretation guard (pre-registered and binding, unchanged from the
frozen registry):** the outputs are a **descriptive reference
distribution under the stated randomization model**. They must NOT be
presented as a definitive strategy p-value. The exchangeability and
independence assumptions behind such a reading are themselves part of
what the Phase-31 audit examines and are stated as limitations in the
synthesis (E1). This guard binds the corrected rerun identically.

## 6. Output naming (future execution only — not created now)

Because the original B1 artifacts must remain untouched, the corrected
artifacts use distinct `_CORRECTED` names:

- `phase31/results/B1_sign_permutation_CORRECTED.csv`
- `phase31/results/B1_summary_CORRECTED.json`
- `phase31/results/B1_CORRECTION_EXECUTION.md` (concise correction
  execution record, contents specified in §7)

These three files **do not exist at the time of this protocol** and are
not created by it. They are produced only by the future corrective
execution, which must register their SHA-256 hashes and re-run the §8
integrity checklist before and after execution.

## 7. Required contents of the future `B1_CORRECTION_EXECUTION.md`

The execution record must identify, at minimum:

- original execution commit: `76e9c3eab3a179dd6d21c5556c74d97a9fa451a0`
- forensic correction commit: `6c95d0123db7af028c1cbdca28619d361ce7746d`
- this correction protocol's commit (the commit that added this
  document, read from the branch git log at execution time)
- frozen B1 seed `20260929`
- exactly 10,000 permutations
- the exact input ledger
  `phase21_experiment_results/phase21_trades.csv` with its verified
  SHA-256
- the exact required operation order (§4, steps 1–5)
- an explicit statement that the original B1 artifacts remain preserved
- an explicit statement that this is a corrective rerun, not the
  original preregistered execution
- an explicit statement that no other Phase-31 family is being rerun
- the environment used (Python/pandas/numpy versions at run time, same
  pattern as the original Phase-31 execution)
- the SHA-256 of every generated `_CORRECTED` artifact

## 8. Integrity checklist (verified before the eventual execution)

Before the corrective execution (and repeated after it), all of the
following must verify; any mismatch is a protocol breach, reported as
such and never silently repaired:

- Golden Reference hash unchanged:
  `b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95`
  (`phase21_historical_reference.py`)
- Dataset hash unchanged:
  `e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52`
  (`eurusd_d.csv`)
- Historical ledger hash unchanged:
  `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`
  (`phase21_experiment_results/phase21_trades.csv`)
- Phase-29 Tier-1 manifest unchanged: **19/19 files** byte-identical to
  the original Phase-29 experiment commit
  `a3dc35ee9a51d42dd3c56f239deac9cd60d726e9` (the exact manifest listed
  in `PHASE31_SPECIFICATION.md` §8 / `PHASE31_EXPERIMENT_REGISTRY.md`)
- Phase-29 Tier-2 documentation unchanged: **3/3 files**
  (`PHASE29_ROBUSTNESS_REPORT.md`, `PHASE29_DATA_AUDIT.md`,
  `PHASE29_DECISION.md`) byte-identical to the reconciled state at
  `2011d2385b525be92d5e39fcb214ee44661a7479`
- Phase-30 preregistration unchanged: **2/2 files**
  (`PHASE30_EXPERIMENT_REGISTRY.md`, `PHASE30_SPECIFICATION.md`)
  byte-identical to `3831031f02938125fd34d9e18eb9ce2562fe992e`
- Original Phase-31 execution artifacts unchanged: every artifact
  byte-identical to its state at
  `76e9c3eab3a179dd6d21c5556c74d97a9fa451a0` —
  `phase31/phase31_execute.py`, `phase31/tests/test_phase31_execution.py`,
  the 13 original result files under `phase31/results/`
  (`A1_block_resampling.csv`, `A1_summary.json`,
  `B1_sign_permutation.csv`, `B1_summary.json`, `B2_consumed.json`,
  `C1_concentration.csv`, `C2_clusters.csv`, `C2_summary.json`,
  `C3_drawdown_structure.csv`, `D1_research_inventory.md`,
  `D2_selection_assessment.md`, `phase31_runtime_log.json`,
  `E1_evidence_matrix.md`), `PHASE31_EXPERIMENT_REGISTRY.md`,
  `PHASE31_SPECIFICATION.md`, and `PHASE31_RESULTS.md` at its forensic
  audit state (`6c95d0123db7af028c1cbdca28619d361ce7746d`)
- Test suites as an integrity check: Phase-29 gates 10/10, main suite
  (`tests/`) 15/15, Phase-31 9/9 — all passing
  (`uv run python -m unittest discover -s <dir>/tests`)
- The corrected outputs land only under the §6 `_CORRECTED` filenames;
  no existing artifact is overwritten

## 9. Hard rules carried forward (summary)

1. Do not execute B1 as part of this protocol's creation.
2. Do not modify or delete the original B1 CSV/JSON.
3. Do not overwrite any existing Phase-31 result.
4. Do not change A1, B2, C1, C2, C3, D1, D2, or E1.
5. Do not change the Golden Reference or the historical ledger.
6. Do not modify Phase-29 or Phase-30 artifacts.
7. Do not alter the original execution commit (no amend, no rebase, no
   history rewrite — the chain is append-only).
8. Do not add new statistical methods (§4 forbidden list).
9. Do not change the seed (`20260929`).
10. Do not change the permutation count (exactly 10,000).
11. Do not change the preregistered B1 metrics (§5).
12. Do not use the observed result to choose any method.
13. Do not merge to `main`.
14. Do not start Phase 32 or Phase 33.

The Phase-29 constraint carries forward unchanged wherever Phase-31
evidence is read: the strategy is **not** robust to execution delay
(+1 bar +20.04R; +2 bars +2.00R vs control +32.2644R) — documented
context, never hidden, never a target.
