# PHASE27_SPECIFICATION.md

Phase: 27 (research/discovery)
Predecessor: Phase 21 — CLOSED (historical implementation reproduced,
byte-identical; see `PHASE21_CLOSURE_REPORT.md`)
Control condition: PHASE-21 GOLDEN REFERENCE
(`phase21_historical_reference.py`,
SHA-256 `b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95`)

## 1. Research question

«Can we identify a research candidate that improves the strategy's robustness
or practical characteristics without relying on hindsight, test-set fitting,
or arbitrary parameter tuning?»

Phase 27 is an experimental research phase, not a continuation of
reconstruction. The Golden Reference is the immutable control; no experiment
modified it.

## 2. Rules as enforced

1. **Golden Reference immutable** — never edited; loaded read-only as a
   module. Hash re-verified after every step.
2. **No test-set optimization** — the final bucket (entry_date > 2023-04-23)
   was evaluated ONLY for candidates already frozen by pre-registered gates;
   gate decisions used train+validation only. No threshold was derived from
   final-period data.
3. **No cherry-picking** — all five pre-registered candidates recorded,
   including four rejections.
4. **No parameter sweeps** — every candidate is a structural rule or a single
   pre-registered threshold with a stated derivation source. No grids of EMA/
   ATR/target values.
5. **Causal ordering** — every feature uses only information available at the
   signal (trailing windows include the signal bar; weekly values are mapped
   backward from completed weekly bars; no future candle, ATR, or regime).

## 3. Control (immutable)

Historical verified benchmark (recorded in PHASE21_CLOSURE_REPORT.md):

| Metric | Value |
|---|---|
| Trades | 115 |
| Win rate | 42.6% |
| Profit factor | 1.49 |
| Total R | +32.26R |
| Max drawdown | −12.00R |
| Train | 78 trades, +24.26R, PF 1.55 |
| Validation | 14 trades, −2.00R, PF 0.80 |
| Final | 23 trades, +10.00R, PF 1.83 |

Historical ledger SHA-256 (full, from the repository artifact
`phase21_experiment_results/phase21_trades.csv`):
`30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`

## 4. Experiment groups executed

27-A baseline diagnostic; 27-B return distribution; 27-C temporal stability;
27-D market-regime descriptives; 27-E multi-currency transfer; 27-F
execution-friction sensitivity; 27-G exit distribution; 27-H position
concurrency; 27-I trade-order randomization; 27-J walk-forward descriptive.
All implemented in `phase27/phase27_baseline.py` and
`phase27/phase27_diagnostics.py`; results in
`phase27/results/phase27_diagnostics.json`, summarized in
`PHASE27_BASELINE_DIAGNOSTICS.md`.

## 5. Candidate acceptance gates (pre-registered)

Recorded in `PHASE27_EXPERIMENT_REGISTRY.md` BEFORE any candidate run:
Gate A no test contamination; Gate B validation evidence (validation R >
−2.00, validation trades ≥ 5, train R ≥ 17.00 = 70% of control train R);
Gate D structural rule (no tuned parameters); Gate E cross-period behavior
(≥ 50% positive years, best-year share ≤ 60% of train+validation R); Gate F
economic plausibility; Gate G reproducibility. A candidate is frozen only if
ALL gates pass. Decisions are mechanical and verified by test
(`phase27/tests/test_phase27_reproducibility.py::test_05`).

## 6. Stop conditions (monitored)

Golden Reference change, ledger change, final-period selection, tuning
against final results, look-ahead, non-reproducibility, undocumented data
change, undocumented manual intervention — none occurred; the baseline script
halts on any ledger-hash mismatch by construction.

## 7. Implementation order as executed

Isolated branch `phase27-research` → hash verification → baseline
reproduction (byte-identical gate) → 27-A..27-J diagnostics → registry
pre-registration → candidate implementation → controlled train/validation
runs → freeze/reject by gates → final evaluation of frozen candidates only →
stop. Phase 28 not started.

## 8. Reproducibility

Python 3.14.7 / pandas 3.0.6 / numpy 2.5.3 (repository env; cross-checked
under the pinned historical stack Python 3.12.14 / pandas 3.0.2 / numpy
2.4.4 for the Golden Reference). Dataset SHA-256
`e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52`; Golden
Reference SHA-256 `b0d84b15…454e95`; experiment code committed on
`phase27-research`; all result-artifact SHA-256 values recorded in
`PHASE27_RESULTS.md`. 27-I uses seed 20260926; all other computations are
deterministic.
