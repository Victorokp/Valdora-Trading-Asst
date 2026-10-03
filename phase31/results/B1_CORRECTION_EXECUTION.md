# B1_CORRECTION_EXECUTION.md — Phase-31 B1 corrective rerun record

**Status: EXECUTED (corrective rerun).** This record documents the single
corrective B1 execution preregistered in
`PHASE31_B1_CORRECTION_PROTOCOL.md`.

## Evidence-chain references

- Original execution commit: `76e9c3eab3a179dd6d21c5556c74d97a9fa451a0` (preserved exactly;
  never modified, never amended)
- Forensic correction commit: `6c95d0123db7af028c1cbdca28619d361ce7746d`
- Correction protocol commit: `8c6e5f10eb055d2616320068bda9e56ac365dd25`
  (`PHASE31_B1_CORRECTION_PROTOCOL.md`)
- This corrective execution commit: the commit that introduces
  `phase31/phase31_b1_correction.py` and the three corrected artifacts
  below onto `phase29-stress` with the message
  "Phase 31: execute preregistered B1 correction" (single append-only
  commit; this document is committed once and never amended — its SHA is
  read from the branch git log)

## Input (frozen, verified)

- Ledger: `phase21_experiment_results/phase21_trades.csv`
- SHA-256: `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0` (verified before and after execution)
- Trades: exactly 115 (exit-date order). Not downloaded, regenerated,
  filtered, reordered, or modified.

## Frozen randomization (exactly as preregistered)

- RNG: `numpy.random.default_rng(20260929)` — one single RNG governs the
  entire prescribed procedure (sign randomization AND the shuffle draw).
- Seed: `20260929`; permutations: exactly 10000; sign probability: 0.5.
- No second RNG, no bootstrap, no magnitude resampling, no change to the
  observation count, no alternative null model, no p-value corrections,
  no confidence intervals, no additional tests, no parameter searches.

## Exact operation order (per permutation, 10000 permutations)

1. Extract the absolute magnitude of each of the 115 trade R values.
2. Independently assign each magnitude a random sign with probability 0.5
   (`rng.choice([-1.0, 1.0], size=115)` on the single frozen RNG).
3. Construct the resulting 115 signed R values.
4. **Shuffle the signed sequence** — `Series.sample(frac=1.0,
   random_state=rng)` — performed after sign randomization and before the
   order-dependent metrics. **Confirmation: the mandatory shuffle WAS
   performed on all 10000 permutations.** This is the step omitted by
   the original execution.
5. Calculate on the shuffled sequence: total R; maximum drawdown
   (cumulative R from 0, dd = cum − running max, reported negative);
   maximum losing streak (consecutive R ≤ 0). Definitions identical to
   the frozen registry (`period_stats` of the original module, reused
   verbatim).

## Environment

- Python 3.14.7 · numpy 2.5.3 · pandas 3.0.6
- Platform: Linux-6.1.158+-x86_64-with-glibc2.35
- Execution script: `phase31/phase31_b1_correction.py`
  (SHA-256 at execution time: `b137848a8014f3f87f95c7174974df0d5025d37f391b88644e0969386c667051`)

## Integrity gates (original module's `gate()`, run before and after)

- Pre-execution gate: pass=True · Tier-1=True (19 files vs
  `a3dc35ee9a51`) · Tier-2=True (3 files vs
  `2011d2385b52`) · Phase-30=True (2 files vs
  `3831031f0293`) · Golden Reference / dataset / ledger
  SHA-256 all exact.
- Post-execution gate: pass=True · Tier-1=True ·
  Tier-2=True · Phase-30=True · immutable hashes
  unchanged.
- Original Phase-31 execution artifacts re-verified byte-identical to
  `76e9c3eab3a1` after execution; forensic documentation
  state preserved at `6c95d0123db7`.

## Generated artifacts (SHA-256)

| Artifact | SHA-256 |
|---|---|
| `phase31/results/B1_sign_permutation_CORRECTED.csv` | `a2fc3db34ed7bb408dbce1a081798d3eb304141d8399c73c0e233facb3e5237b` |
| `phase31/results/B1_summary_CORRECTED.json` | `7f0d215e2026b8576efd54e228b748820b251f16bc4670ce4745c4c7791217cc` |
| `phase31/results/B1_CORRECTION_EXECUTION.md` | this record |

## Headline corrected results (descriptive; guard below)

- Null total-R percentiles (1/5/25/50/75/95/99):
  1: -38.0864R, 5: -26.2461R, 25: -10.2461R, 50: +0.0864R, 75: +11.7356R, 95: +26.2644R, 99: +37.9319R
- Observed +32.2644R: percentile 97.73 of the
  null; P(null total R ≥ observed) = 0.0227
- Null maxDD percentiles (1/5/25/50/75/95/99):
  1: -43.9327R, 5: -34.2644R, 25: -23.0981R, 50: -17.0000R, 75: -12.8338R, 95: -8.7961R, 99: -7.0000R
- Observed −12R maxDD: percentile 80.14 of the
  null maxDD distribution
- Null max losing streak p50/p95: 6 /
  10

## Interpretation guard (preregistered, binding)

This is a **descriptive reference distribution under the stated
randomization model**. It must **NOT** be presented as a definitive
strategy p-value. The exchangeability/independence assumptions behind
such a reading are examined in the Phase-31 synthesis and stated as
limitations.

## Confirmations

- The original B1 artifacts (`B1_sign_permutation.csv`,
  `B1_summary.json`, runtime-log B1 block) remain **untouched and
  byte-identical to `76e9c3eab3a1`**; nothing was
  overwritten, regenerated, or deleted.
- This execution is a **corrective rerun, not the original preregistered
  execution** and not a replacement of the historical record.
- **No other Phase-31 family was rerun**: A1, B2 (consumption), C1, C2,
  C3, D1, D2, E1 are unchanged. The C3 reconciliation at
  `6c95d0123db7` is not re-opened. E1 is not modified by this
  execution.
