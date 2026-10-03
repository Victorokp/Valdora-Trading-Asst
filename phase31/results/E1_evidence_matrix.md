# E1 — Evidence Matrix (Phase 31 statistical synthesis)

**POST-EXECUTION FORENSIC CORRECTION (append-only):** rows 3 and 7 of
this matrix incorporated metrics later found to deviate from or
miscalculate the preregistered definitions; see the forensic audit in
`PHASE31_RESULTS.md` and the row-level notes below. No artifact was
rewritten; no experiment was rerun. Phase-31 status is **EXECUTED —
FORENSIC PROTOCOL DEVIATION IDENTIFIED; VALIDITY REVIEW REQUIRED.**

**E1 CLOSURE UPDATE (append-only):** the validity review was resolved by
the preregistered B1 corrective rerun — protocol
`8c6e5f10eb055d2616320068bda9e56ac365dd25`, corrected execution
`03f95618eb05607fe1ff5132c74abd0ffaa4021b` — which has been
independently audited and is valid. Phase-31 status is now
**PHASE 31 — CLOSED AFTER CORRECTIVE B1 VALIDATION** (see the closure
statement in the synthesis section below). No row below is deleted;
row 3 now distinguishes the ORIGINAL execution from the CORRECTED
execution, and the original B1 artifacts remain preserved as historical
evidence.

Inputs: `phase21_experiment_results/phase21_trades.csv`
(SHA `30d22be4…f70d0`), `phase29/results/phase29_summary.json` (consumed
read-only), Phase-31 A1/B1/C1/C2/C3 outputs (this directory, seeds and
counts in `phase31_runtime_log.json`). All input hashes re-verified at
synthesis time. Control values are frozen reference values: 115 trades ·
49W/66L · 42.6087% WR · PF 1.4889 · **+32.2644R** · maxDD −12R.

| # | Evidence row | Key results | Neutral state | What it establishes | What it cannot establish |
|---|---|---|---|---|---|
| 1 | Control result (frozen) | 115 trades, PF 1.4889, +32.2644R, maxDD −12R, streak 7 | SUPPORTED (as the frozen reference object) | The audited historical benchmark exists, is hash-pinned, and is deterministically reproducible | Whether the configuration was selected before the historical package was created (D2: UNKNOWN) |
| 2 | Dependence-aware resampling (A1; blocks monthly/quarterly/yearly, 10,000 resamples each, seeds 20260926/27/28) | P(total R ≤ 0) = 3.74% / 3.14% / 2.24%; P(total R ≥ observed) = 50.3% / 49.8% / 50.3%; total-R p5 = +2.28 / +5.09 / +5.45R; maxDD p1 = −26.7 / −26.0 / −22.0R | **SUPPORTED** (with documented clustering cost) | The positive aggregate is robust to block-level resampling across three granularities: ≥ 96–98% of block-resamples remain positive; clustering shifts the p1 drawdown to −22R..−27R (vs independent-draw −17R; Phase-29 fixed-order −12R) | Not a causal statement about future profitability; block-resampled paths are synthetic reorderings, not forecasts |
| 3 | Sign-permutation reference (B1; 10,000 permutations, seed 20260929) | **CORRECTED EXECUTION** (preregistered `8c6e5f1…`, executed `03f9561…`, independently audited; operation: magnitudes → independent sign randomization p=0.5 → **shuffle** → metrics, single RNG `numpy.random.default_rng(20260929)`): null total-R p1/5/25/50/75/95/99 = −38.0864 / −26.2461 / −10.2461 / +0.0864 / +11.7356 / +26.2644 / +37.9319R; observed +32.2644R at the **97.73rd** percentile; P(null total R ≥ observed) = **2.27%**; null maxDD p1/5/25/50/75/95/99 = −43.9327 / −34.2644 / −23.0981 / −17.0000 / −12.8338 / −8.7961 / −7.0000R; observed −12R at the **80.14th** percentile; null max losing streak p50/p95 = 6/10. **ORIGINAL EXECUTION** (preserved, `76e9c3e…`): total-R 97.75th pct / P = 2.25% (order-invariant, remains usable as sign-randomization evidence); maxDD 80.3rd pct — invalid under the frozen protocol (shuffle omitted) | **MIXED** | Under the preregistered fair-coin sign randomization **with shuffle**, the observed aggregate is uncommon (97.73rd pct) — the outcome mix is not explained by chance signs alone; the observed −12R drawdown is not unusually extreme relative to this particular randomized null (80.14th pct), whose envelope is broad. The corrected rerun confirms the original total-R was essentially unchanged by adding the required shuffle, while correcting the order-dependent maxDD/streak analysis; the correction is not a new hypothesis, optimization, or parameter search | **Not a definitive p-value** (preregistered guard, binding): the fair-coin model discards the strategy's actual long/short-selection mechanism and serial structure; it cannot certify a trading edge, only quantify the reference distribution under its own assumptions. 2.27% is a descriptive randomization reference, not a confirmed significance level. **FORENSIC CORRECTION (resolved):** the original executed B1 omitted the preregistered shuffle — its total-R figures are order-invariant and remain usable, its **maxDD/streak figures are NOT valid** for the frozen protocol and are superseded for interpretation by the corrected execution above; the original artifacts remain preserved and the corrected rerun does not erase the historical original execution |
| 4 | Order-stress evidence (B2 — consumed Phase-29 artifact, no rerun) | median maxDD −9R, p5 −14R, p1 −17R, worst −24.9R; P(worse than −12R) = 12.04% | **LIMITED** (risk-envelope input) | Quantifies ordering sensitivity of the *same* trade set: realized −12R is an unfavorable ordering; planning should anticipate p1 ≈ −17R | Does not speak to whether the trade *set* itself would recur |
| 5 | Concentration (C1) | largest winner +2.17R = 2.2% of gross +98.26R; top-5 = 10.4%; top-10 = 20.6%; positive years 2005–2018 spread; 2025 alone +11R | **SUPPORTED** (low concentration) | The +32.26R is broadly distributed: no single trade exceeds 2.2% of gross profit; removing the top-10 still leaves +12R (Phase-29 F1) | Distribution across *past* trades does not guarantee similar breadth in future trade populations |
| 6 | Cluster structure (C2) | longest win streak 4; longest loss streak 7; 23 win clusters / 24 loss clusters; loss-run distribution shows three 7-loss runs | **SUPPORTED** (structure characterized) | Consecutive-loss risk of 5–7 is intrinsic to the 42.6% win-rate structure, not an anomaly | Streak statistics of one historical path do not bound future streaks |
| 7 | Drawdown/recovery structure (C3) | 10 episodes; depths −12, −9, −4, −3×4, −2, −1×2; 89/115 trades underwater; episode durations incl. 34 (−9R episode) and 29 (−12R episode); **registry-defined largest recovery requirement 17 trades (18 incl. trough), from the −9R episode** | **SUPPORTED** (path characterized; recovery metric corrected) | The realized path's drawdown structure is fully characterized and consistent with Phase-29's episode analysis | Path characteristics of one realization do not bound future paths (see B2/Monte-Carlo envelope). **FORENSIC CORRECTION:** the original artifact's `recovery_trades` column was miscomputed by an index-drift bug (max 7 is the max of the miscomputed column, not the registry recovery); the "34" figure is the −9R episode's *duration/time-underwater*, not a recovery duration. Read-only recomputation gives registry recoveries 1, 17, 3, 2, 3, 1, 1, 15, 2, open |
| 8 | Research history (D1) | Preregistered families in 27/28/29/31; rejected candidates documented (C1/C2/C4/C5); no adopted candidate; Phase-30 preregistered unexecuted | **SUPPORTED** (as documented record) | The in-repository research search space is bounded and documented; no unregistered search found in any commit | Research performed outside the repository (esp. the historical package's generating session) is unquantifiable — D1 UNKNOWN |
| 9 | Selection-bias assessment (D2) | No result-informed experiment selection recorded in any phase; package origin **UNKNOWN**; post-hoc Phase-29 corrections were append-only and disclosed; interpretation reconciliations disclosed | **MIXED** | In-repository process shows preregistration-before-execution at every phase and full disclosure of post-hoc documentation corrections | The decisive unknown — whether the historical 115-trade configuration itself was selected after observation in its originating environment — **cannot be established from available evidence** |
| 10 | Execution-timing constraint (carried from Phase 29, not re-tested) | control +32.2644R; +1 bar +20.04R (PF 1.286, maxDD −18R); +2 bars +2.00R (PF 1.026) | **LIMITED** (as an evidence constraint: next-open-dependent) | The entire evidence base is conditional on prompt next-open execution; the edge decays ~38% at +1 bar and is exhausted at +2 bars | Daily data cannot resolve intraday latency/spread feasibility (Phase-30 Family B is preregistered for this) |

## Synthesis statement

The preregistered statistical families **demonstrate**: (a) the frozen
historical result is reproducible, hash-pinned, broadly distributed
across trades and years, robust to block-level temporal resampling
(≥ 97% of resamples positive under all three block definitions), and
uncommon under a sign-randomization reference model; (b) drawdown risk
should be planned at the resampling/Monte-Carlo envelope (p1 −17R to
−22R) rather than the realized −12R; (c) the in-repository research
process shows no result-informed experiment selection and complete
disclosure of post-hoc documentation corrections.

The preregistered families **cannot establish**: statistical
significance in the confirmatory sense (B1 is a descriptive reference
under stated assumptions, not a definitive test); freedom from
selection at the strategy's origin (D2 UNKNOWN on the historical
package's generating session); or any statement about future
profitability. External validation remains outstanding (Phase 30,
preregistered, unexecuted). The execution-timing fragility stands as a
binding constraint on any practical reading of this evidence.

**Corrected B1 (post-audit) — what the randomization exercise
suggests.** The preregistered B1 corrective rerun (protocol
`8c6e5f1…`; corrected execution `03f9561…`; independently audited)
reproduces the frozen method exactly: magnitudes → independent sign
randomization (p = 0.5, single RNG `numpy.random.default_rng(20260929)`)
→ **shuffle** → metrics, 10,000 permutations on the frozen 115-trade
ledger. The corrected distribution places the observed +32.2644R at the
97.73rd percentile; 2.27% of the 10,000 corrected randomized sequences
had total R ≥ the observed result. This is a descriptive randomization
reference, **not** a definitive p-value. The corrected maxDD
distribution (p50 −17R; p1 −43.9R; p99 −7.0R) places the observed −12R
at the 80.14th percentile: the observed drawdown is not unusually
extreme relative to this particular randomized null, and the null
maxDD envelope is broad. The corrected p50/p95 maximum losing-streak
reference is 6/10. The corrected rerun confirms that the original
total-R result was essentially unchanged by adding the required
shuffle, while correcting the order-dependent maxDD/streak analysis.
The correction does not constitute a new hypothesis, optimization, or
parameter search. Evidence states are not upgraded because the
corrected total-R reference is favorable, and not downgraded because
the null maxDD distribution is broad.

**What remains uncertain / what cannot be established.** Directly
shown: the frozen benchmark's reproducibility, breadth, block-resample
robustness, concentration, cluster structure, and realized drawdown
path. Suggested (model-dependent, descriptive only): that the observed
aggregate is uncommon under the corrected sign-randomization reference
(97.73rd pct), and that the realized drawdown is not extreme against
that null. Uncertain: every inference rests on one 115-trade
historical path whose trades are not necessarily independent, examined
across multiple dimensions of the same data (multiple views, not
independent confirmation). Cannot be established from the available
record: whether the historical configuration was selected after
observation in its originating out-of-repository environment (D2:
UNKNOWN/MIXED as documented), and anything about future performance.
Forward validation remains outstanding (Phase 30, preregistered,
unexecuted).

**Phase-31 closure.** Phase 31 is closed as an evidence-assessment
phase after completion and validation of the preregistered B1
corrective rerun. The resulting evidence remains subject to the
documented limitations, including execution-timing sensitivity,
historical sample size, trade dependence,
multiple-testing/research-history uncertainty, and absence of forward
external validation. Closure means the preregistered Phase-31
evidence-sufficiency assessment has been completed and its documented
evidence states have been synthesized; it does **not** mean the
trading strategy is proven, live-trading readiness is established,
execution robustness is established, external validation is complete,
future performance is guaranteed, or Phase 30 is complete. Phase 30
remains **PREREGISTERED — WAITING FOR A1 ELIGIBILITY** (≥ 60
qualifying EURUSD daily trading days strictly after 2026-09-25;
unchanged Golden Reference logic; no early execution; pre-cutoff data
do not satisfy the requirement).

**No overall score, ranking, "best" category, confidence grade, or
strategy rating is produced.** The strategy is not declared "proven",
"safe", "guaranteed", or future-profitable.

FUTURE RESEARCH QUESTION — NOT TESTED IN PHASE 31: none were triggered;
no unregistered analysis was performed. (Phase-30 families remain the
preregistered next step: external validation, execution realism, and
failure-structure measurement.)
