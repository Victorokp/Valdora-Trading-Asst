# PHASE29_DATA_AUDIT.md

Phase 29 data and integrity audit. Nothing was modified: the Golden
Reference, the dataset, the historical ledger, the Phase-27 candidate, and
the Phase-28 OOS artifacts are all hash-verified unchanged.

## Artifact hash register (§29/§23)

| Artifact | SHA-256 |
|---|---|
| Golden Reference `phase21_historical_reference.py` | `b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95` |
| Dataset `eurusd_d.csv` | `e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52` |
| Historical ledger (gate-checked every run) | `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0` |
| `phase29/results/PHASE29_STRESS_RESULTS.csv` | see `phase29/results/hashes.txt` (committed at freeze) |
| `phase29/results/PHASE29_EXECUTION_STRESS.csv` | `hashes.txt` |
| `phase29/results/PHASE29_PARAMETER_SENSITIVITY.csv` | `hashes.txt` |
| `phase29/results/PHASE29_DRAWDOWN_STRESS.csv` | `hashes.txt` |
| `phase29/results/PHASE29_TEMPORAL_STRESS.csv` | `hashes.txt` |
| `phase29/results/PHASE29_REGIME_STRESS.csv` | `hashes.txt` |
| `phase29/results/phase29_control_baseline.csv` | `hashes.txt` |
| `phase29/results/phase29_summary.json` | `hashes.txt` |

Environment: Python 3.14.7 · pandas 3.0.6 · numpy 2.5.3 (repo `uv`
environment). Seeds: F-family 29092601–29092620 (20 seeds × 3 rates +
winner-removal runs); G/I Monte Carlo seed 20290926 × 10,000 iterations.
All stochastic experiments use `numpy.random.default_rng` with the
recorded seeds; every other calculation is deterministic.

## Integrity checks performed

1. Golden Reference SHA-256 re-verified at every stress-module run start
   (hard stop on mismatch) and by test gate 01 — PASS.
2. Dataset SHA-256 re-verified at every run start and by test gate 02 —
   PASS.
3. Historical ledger regeneration: byte-identical
   (`30d22be4…f70d0`), gate 03 — PASS.
4. Control baseline (stress engine, control settings) equals the Golden
   Reference benchmark exactly: 115 / 42.6087% / PF 1.4889 /
   +32.2644R / maxDD −12.00R / streak 7 — gate 04 — PASS.
5. Cross-pair FULL rows reproduce the historical Phase-23 benchmarks
   (GBPUSD 152/+4.40/1.04; USDJPY 118/+5.00/1.06; AUDUSD 123/−8.98/0.89)
   — gate 09 — PASS.
6. Determinism: full battery re-run, all result artifacts
   byte-identical (`sha256sum` diff empty) — gate 08 — PASS.
7. No favorable-slippage path exists in the stress engine (source-level
   assertion) — gate 06 — PASS.
8. Phase-28 OOS artifacts and Phase-27 candidate files were read but
   never written by Phase 29 (their recorded hashes from
   `PHASE28_STATISTICS.md` are unchanged on disk) — PASS.
9. Working-tree discipline: only `PHASE29_EXPERIMENT_REGISTRY.md`,
   `phase29/`, and the four Phase-29 reports plus root CSV artifacts were
   created; no existing tracked file was modified — PASS.

## Data-quality notes

- The stress engines operate on the same Golden Reference pipeline
  (dataset → weekly filter → daily signals → per-signal trades) with
  perturbations confined to execution parameters; signal logic is
  identical in every experiment (verified structurally in code review and
  empirically by the control-equality gate).
- The Family-J table is re-read from the committed Phase-28 walk-forward
  artifact (no recomputation drift possible); its hash was recorded in
  `PHASE28_STATISTICS.md` and is unchanged.
- The Family-K regime cohort file
  (`phase27/results/phase27_enriched_trades.csv`) was produced in Phase 27
  (its `atr_pct` diagnostic column was fixed during Phase 27 before the
  Phase-27 candidate evaluation, so cohort membership here matches the
  documented Phase-27 regime diagnostics).
