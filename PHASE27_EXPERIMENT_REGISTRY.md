# Phase-27 Experiment Registry

Immutable append-only registry. Every experiment is recorded, including
failures. Statuses are updated after execution; entries are never rewritten
to change their meaning.

## Registry metadata

- Registry created: 2026-09-26, BEFORE any candidate was implemented or run.
- strategy_version: PHASE-21 GOLDEN REFERENCE (control),
  `phase21_historical_reference.py`
  SHA-256 `b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95`
- data_version: `eurusd_d.csv`
  SHA-256 `e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52`
  (cross-pair: `gbpusd_d.csv` `e8f7c79d…e8a189`, `usdjpy_d.csv`
  `03f49d95…718656`, `audusd_d.csv` `f23247fd…97ed6e3`)
- training_period: entry_date ≤ 2019-11-20 (78 control trades, +24.26R)
- validation_period: 2019-11-20 < entry_date ≤ 2023-04-23 (14 control trades,
  −2.00R)
- test_period (evaluation only, until candidate freeze): entry_date >
  2023-04-23 (23 control trades, +10.00R, PF 1.83)
- Golden Reference ledger SHA-256 (control artifact):
  `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0`

## Pre-registered acceptance gates (fixed before candidate runs)

A candidate is FROZEN only if it passes ALL of:

- **Gate A — No test contamination**: the candidate's rule, threshold, and
  code were frozen before any final-period (entry > 2023-04-23) evaluation,
  and no threshold was derived from final-period data. Derivation sources are
  stated per candidate.
- **Gate B — Validation evidence**: validation-bucket total R > control's
  −2.00R, AND validation trade count ≥ 5, AND train total R ≥ 70% of the
  control's train R (≥ 17.00R).
- **Gate D — Robustness (structure)**: the rule contains no continuous
  parameter tuned by search; any threshold is a single pre-registered value
  with a stated derivation source (Rule 4: no sweeps).
- **Gate E — Cross-period behavior**: positive total R in at least half of
  the train+validation calendar years containing trades, AND no single
  calendar year contributes more than 60% of the candidate's train+validation
  total R.
- **Gate F — Economic plausibility**: stated per candidate below.
- **Gate G — Reproducibility**: deterministic from fixed inputs (seeded or
  seed-free); artifact hashes recorded.

Multiple-hypothesis note: five candidates are registered. Chance discoveries
are possible; the gate structure and the Phase-28 independent validation are
the countermeasures. The owner decides on any candidate; Phase 27 only
freezes or rejects.

## Diagnostic experiments (27-A .. 27-J) — hypothesis-free

| experiment_id | hypothesis | parameters | features | result | status |
|---|---|---|---|---|---|
| 27-A | Baseline reproduction + enriched trade table | none (control) | Golden pipeline | ledger byte-identical; 115 trades; +32.2644R; PF 1.4889; maxDD −12.0 | COMPLETE |
| 27-B | Return-distribution diagnostic | none | R series | see PHASE27_BASELINE_DIAGNOSTICS.md §2 | COMPLETE |
| 27-C | Temporal stability | none | exit timestamps | 21 years; 251 rolling-12m windows | COMPLETE |
| 27-D | Regime descriptives (entry-available only) | none | weekly separation, ATR percentile, breakout size, EMA gap, candle range | quartile/tertile tables in diagnostics JSON | COMPLETE |
| 27-E | Multi-currency transfer (no per-pair tuning) | none | golden logic, pair pip sizes | GBPUSD 152/+4.40R/PF 1.04; USDJPY 118/+5.00R/PF 1.06; AUDUSD 123/−8.98R/PF 0.89 — matches historical Phase-23 references | COMPLETE |
| 27-F | Execution-friction robustness curve | grid {0.0,0.5,1.0,1.5,2.0,3.0,4.0} pips | friction only | PF 1.543→1.436 across grid; control 1.5 pip; degradation gradual | COMPLETE |
| 27-G | Exit-mechanism distribution | none | outcomes | see diagnostics JSON | COMPLETE |
| 27-H | Concurrency analysis + single-position diagnostic subset | none | overlap intervals | 52 overlapping trades; max 6 concurrent; level tables recorded | COMPLETE |
| 27-I | Trade-order randomization | 10,000 perms, seed 20260926 | R permutation | median maxDD −9.0R; actual −12.0R at ~85th percentile of orderings | COMPLETE |
| 27-J | Walk-forward descriptive windows | anchors 2004–2019 | entry-year bucketing | 16 windows reported; no optimization | COMPLETE |

## Research candidates (pre-registered, statuses pending)

| experiment_id | hypothesis | parameters | features | derivation source | result | status |
|---|---|---|---|---|---|---|
| C1_concurrency_cap_1 | Limiting the strategy to one open position reduces drawdown without destroying expectancy (risk control) | concurrency cap = 1 (structural) | open-position count at signal | structural; no data-derived threshold | pending | PENDING |
| C2_weekly_separation_floor | Entries made when weekly EMA10 is far above weekly EMA20 (stronger trend regime) are more reliable | weekly (EMA10−EMA20)/Close ≥ 0.0025 | weekly separation at signal | validation-bucket feature analysis (all 14 validation trades had separation < 0.25%; derived from train+validation data only) | pending | PENDING |
| C3_vol_percentile_floor | Avoid the lowest decile of trailing volatility, where breakout confirmation is least reliable | trailing 100-bar ATR percentile ≥ 0.10 | ATR percentile at signal (backward-looking window) | pre-registered decile floor; validation-bucket low-vol trades were the largest validation losers (derived from train+validation data only) | pending | PENDING |
| C4_concurrency_cap_2 | Entries opened while ≥ 2 positions are already open add risk without adding edge; cap concurrent entries at 2 | concurrency cap = 2 (structural) | open-position count at signal | structural; no data-derived threshold | pending | PENDING |
| C5_quality_combo | Combining C2 + C3 keeps only high-quality regime entries | weekly separation ≥ 0.0025 AND ATR percentile ≥ 0.10 | as C2, C3 | as C2, C3 (same single thresholds, no re-tuning) | pending | PENDING |

All candidate engines are separate implementations; the Golden Reference file
is not modified. Filter candidates (C2/C3/C5) leave the execution engine
untouched (they only remove signals); concurrency candidates (C1/C4) use a
separate position-gated engine with otherwise identical execution rules.

Statuses below are appended after execution — never overwritten:

## Appended 2026-09-26 (post-run; mechanical gate outcomes)

| experiment_id | result | status | reason_for_acceptance/rejection |
|---|---|---|---|
| C1_concurrency_cap_1 | train 56 tr +16.26R PF 1.51; validation 10 tr +2.00R PF 1.33 maxDD −4 | REJECTED | Gate B failed: train R 16.26 < 17.00 floor (70% of control). Validation improved but train shortfall is disqualifying; no re-tuning permitted. |
| C2_weekly_separation_floor | train 69 tr +18.26R PF 1.46; validation 11 tr −2.00R PF 0.75 maxDD −8 | REJECTED | Gate B failed: validation R −2.00 is not > −2.00; 27-D non-monotonic quartile pattern already warned against this class. |
| C3_vol_percentile_floor | train 58 tr +17.18R PF 1.52 maxDD −8; validation 8 tr +4.00R PF 2.00 maxDD −1 | FROZEN | Passed Gates A/B/D/E/F/G. Post-freeze final evaluation (reporting only): 20 tr, +7.00R, PF 1.64, maxDD −4 — weaker than control final (+10.00R, PF 1.83). Retained as frozen artifact for owner review. |
| C4_concurrency_cap_2 | train 72 tr +24.26R PF 1.61; validation 14 tr −2.00R PF 0.80 maxDD −7 | REJECTED | Gate B failed: validation unchanged at −2.00 (not > −2.00). |
| C5_quality_combo | train 33 tr +10.18R PF 1.86; validation 5 tr +4.00R PF 2.00 | REJECTED | Gate B failed: train R 10.18 < 17.00 floor. |

Registry note: all five candidates ran exactly once with their
pre-registered constants. No threshold was adjusted after seeing any result,
including after the frozen candidate's final evaluation.

## Phase-27 outcome

**Outcome B — no robust improvement identified.** C3 is frozen but its
post-freeze final evidence does not dominate the control. The Golden
Reference remains the research control. Phase 28 not started.
