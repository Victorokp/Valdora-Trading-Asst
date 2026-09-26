# PHASE31_RESULTS.md — hash register & execution record

**STATUS (corrected by post-execution forensic audit, append-only):
EXECUTED — FORENSIC PROTOCOL DEVIATION IDENTIFIED; VALIDITY REVIEW
REQUIRED.** See the two audit sections at the end of this file. The
original execution evidence below is preserved unchanged.

Execution per `PHASE31_EXPERIMENT_REGISTRY.md` @ `1551f0f`. Frozen order
**A1 → B1 → (B2 consumption) → C1 → C2 → C3 → D1 → D2 → E1**, each run
once, no adaptive branching. Environment: Python 3.14.7 · pandas 3.0.6 ·
numpy 2.5.3 (recorded in `phase31_runtime_log.json`).

## Integrity gates

| Check | Pre-execution | Post-execution |
|---|---|---|
| Golden Reference SHA-256 | PASS | PASS |
| Dataset SHA-256 | PASS | PASS |
| Historical ledger SHA-256 | PASS | PASS |
| Tier-1 manifest (19 files vs `a3dc35e`) | PASS 19/19 | PASS 19/19 |
| Tier-2 docs (3 files vs `2011d23`) | PASS 3/3 | PASS 3/3 |
| Phase-30 preregistration (vs `3831031`) | PASS 2/2 | PASS 2/2 |

(Recorded in `phase31_runtime_log.json`; any breach would have raised a
hard stop. None occurred.)

## Seeds & sample counts (exactly as preregistered)

- A1: monthly seed `20260926`, quarterly `20260927`, yearly `20260928`;
  10,000 resamples per block definition.
- B1: seed `20260929`; 10,000 permutations.
- B2: consumption only of `phase29/results/phase29_summary.json`
  (SHA-256 recorded in the runtime log) — no rerun.
- C1/C2/C3/D1/D2/E1: deterministic, no seeds.

## Artifact hash register (SHA-256)

| Artifact | SHA-256 |
|---|---|
| `phase31/results/A1_block_resampling.csv` | `ad32cd6ab72774513bc1427ef15b91f5546986fd4c18bebc02b21a436fe75bc2` |
| `phase31/results/A1_summary.json` | `1ffe283f15aa5cac1941bede9ee82491d1e1b5c69cd0ff9100dd7993c72d6298` |
| `phase31/results/B1_sign_permutation.csv` | `976dd7f63bdd87babf7aab5b069bd6df50be726b973c1303419be6aebac2ba2d` |
| `phase31/results/B1_summary.json` | `9131476ea3bb4e3c2a3184bce46141db686740cbcfb70e4dc905144eafc343e1` |
| `phase31/results/B2_consumed.json` | `178b057aa49593f805571b5bc361a13875478697ca540ae1de3a9c62a5c99db6` |
| `phase31/results/C1_concentration.csv` | `c0f3e7a727735fae9a35f6a522d94922ca7ec6b1fbd41f430261d71a92ac6b2a` |
| `phase31/results/C2_clusters.csv` | `ba26153dc969c1644f81cc0cbfa7c00b25090c38f919e8e2e7b7a4df81f6f8eb` |
| `phase31/results/C2_summary.json` | `023fb728387497960538016ba02197a52fdd24778d099369544bd65c0df7c70c` |
| `phase31/results/C3_drawdown_structure.csv` | `4d408e2b9b94347ef63029ff9d6ee2f6f1c71b3036c75fbd0ec6d880da3fa7a1` |
| `phase31/results/phase31_runtime_log.json` | `95ae66b8429d5ed43ead41a743e152c94319bf4e306e543b000f5d344863e7c6` |
| `phase31/results/D1_research_inventory.md` | `920df891bee3b76a98e52c626046e28401367cdbc2b808ebeb1fae41b795b5d6` |
| `phase31/results/D2_selection_assessment.md` | `b07fa775d43bb23bb2b7b8a409f92a3ac44e2c9dde0f4def2c23a3bd3193e70c` |
| `phase31/results/E1_evidence_matrix.md` | `03530b333e4ee07402e0f5e7d2dedcdcee5499cb4b24748e6cfb75b7055a54ad` |

Determinism: full re-execution reproduced every artifact byte-identically
(`test_08_deterministic_rerun_byte_identical`, and an explicit manual
re-run hash comparison before the documentary families were authored).

## Key outputs (summary; full data in the artifacts)

- **A1 (dependence-aware):** P(total R ≤ 0): monthly 3.74%, quarterly
  3.14%, yearly 2.24%. P(total R ≥ +32.2644R): 50.3% / 49.8% / 50.3%
  (observed ≈ median of block-resampled distribution, as expected
  since blocks reproduce the original trades). Total-R p5: +2.28R /
  +5.09R / +5.45R. maxDD p1: −26.66R / −25.99R / −21.98R.
- **B1 (sign-permutation reference):** null total-R median −0.07R;
  observed +32.2644R at the **97.75th** percentile; P(null ≥ observed)
  = **2.25%**; observed −12R maxDD at the 80.3rd percentile of the null.
  Preregistered guard: descriptive under the stated model, **not** a
  definitive p-value.
- **B2 (consumed):** Phase-29 order stress — median maxDD −9R, p5 −14R,
  p1 −17R, worst −24.911R, P(< −12R) = 12.04%.
- **C1:** largest winner +2.17R (2.2% of gross +98.26R); top-5 10.4%;
  top-10 20.6%.
- **C2:** win streaks max 4 / loss streaks max 7; 23 win / 24 loss
  clusters.
- **C3:** 10 episodes (depths −12, −9, −4, −3×4, −2, −1×2); 89/115
  trades underwater; largest recovery requirement 34 trades.
- **D1/D2:** see `D1_research_inventory.md`, `D2_selection_assessment.md`.
- **E1:** see `E1_evidence_matrix.md` — neutral states only.## Deviations

None. No gate breach, no rerun, no added experiment, no methodology change.

**CORRECTED (post-execution forensic audit — the statement above is
superseded):** one methodological execution deviation was identified in
B1 (missing shuffle) and one metric miscalculation in C3 (recovery
durations). Both are documented in full below. No artifact was
overwritten; no experiment was rerun.

---

# POST-EXECUTION FORENSIC AUDIT — PROTOCOL DEVIATION (B1)

- **Preregistered B1** (registry @ `1551f0f`): extract the 115 trade
  magnitudes; independently flip each magnitude's sign with probability
  0.5; **shuffle the resulting signed sequence**; compute total R, maxDD,
  and maximum losing streak; repeat 10,000 times with seed `20260929`.
- **Executed implementation** (`phase31/phase31_execute.py`, B1 block):
  signs were randomized exactly as registered
  (`rng.choice([-1.0, 1.0], size=len(mags))`), but the resulting signed
  sequence was **not shuffled** — order-dependent metrics were computed
  on the sign-flipped sequence in its original positions.
- **Consequences:**
  - The **total-R distribution is order-invariant** (a sum of
    independently sign-flipped magnitudes is unaffected by sequence
    order). The B1 total-R outputs — null percentiles, observed
    +32.2644R at the 97.75th percentile, P(null ≥ observed) = 2.25% —
    are **valid draws from the preregistered total-R null** and remain
    usable, distinguished from the order-dependent metrics.
  - The **maxDD and maximum-losing-streak distributions are NOT valid
    representations of the frozen B1 protocol** (they describe random
    signs in fixed positions, not shuffled positions). The reported
    observed maxDD percentile (80.34) and null maxDD/streak percentiles
    must not be used as B1 evidence.
- The original B1 artifacts (`B1_sign_permutation.csv`,
  `B1_summary.json`, runtime-log B1 block) remain **preserved exactly as
  produced** — not overwritten, regenerated, or deleted. Commit
  `76e9c3ea` stands as the exact record of the original execution.
- This is a **methodological execution deviation**, not evidence for or
  against the trading strategy.

# C3 METRIC RECONCILIATION

Ground truth established by read-only recomputation from the frozen
ledger (no artifact modified):

**What is CORRECT in the C3 artifact (verified):** episode detection,
episode depths (−12, −9, −4, −3×4, −2, −1×2), episode durations
(1, 34, 5, 4, 5, 1, 2, 29, 4, 4 — summing to 89), and total time
underwater (89/115 trades). These match the registry definitions and
the Phase-29 episode structure.

**What is NOT the registry-defined recovery duration:**
- The preregistered definition: *recovery duration = trades from trough
  back to the prior peak; largest recovery requirement = longest
  recovery duration*.
- The implemented code derived a positional index by summing prior
  episode durations plus prior recorded recovery values, then scanned
  forward from that index while the drawdown series was negative — an
  index that drifts from the true episode-end position. The resulting
  `recovery_trades` column (2, 4, 1, 3, 2, 2, 1, 7, 2, null) does not
  equal the registry-defined recovery durations.
- **True registry-defined recovery durations** (trades after the trough
  until equity first re-reaches the prior peak), per episode:
  1, **17**, 3, 2, 3, 1, 1, **15**, 2, and open (final episode never
  recovered). Counting the trough trade itself (inclusive variant):
  2, 18, 4, 3, 4, 2, 2, 16, 3, open.
- **Reconciliation of the two headline numbers:**
  - **"34"** (PHASE31_RESULTS key-outputs bullet "largest recovery 34
    trades") is **the −9R episode's DURATION — its time-underwater
    length (34 consecutive underwater trades)** — not a recovery
    duration. It is a real, correctly computed quantity, mislabeled in
    the summary bullet.
  - **"7"** (runtime log `largest_recovery_requirement_trades = 7`) is
    simply the **maximum of the miscomputed `recovery_trades` column**,
    not the registry-defined largest recovery requirement.
  - **Registry-defined largest recovery requirement = 17 trades** (from
    the −9R episode's trough back to its prior peak; 18 if the trough
    trade is counted). Notably it belongs to the −9R episode, not the
    deepest −12R episode (whose registry recovery is 15/16) — smaller
    depth, longer recovery.
- No metric was relabeled to improve or worsen any appearance; the
  correct registry-defined values are stated above and the original
  artifact values are preserved for audit.

**Scope of impact:** A1, C1, C2, D1, D2 outputs are unaffected. B1
total-R outputs are unaffected (order-invariant). B1 maxDD/streak
outputs and C3 recovery outputs are affected as described. B2 is
unaffected (the consumed Phase-29 Monte Carlo did shuffle:
`rs[rng.permutation(len(rs))]`).
