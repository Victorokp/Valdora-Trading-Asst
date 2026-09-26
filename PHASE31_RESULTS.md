# PHASE31_RESULTS.md — hash register & execution record

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
- **E1:** see `E1_evidence_matrix.md` — neutral states only.

## Deviations

None. No gate breach, no rerun, no added experiment, no methodology
change.
