# PHASE27_RESULTS.md

Deterministic results of the pre-registered candidate experiments. Gate
definitions and provenance: `PHASE27_EXPERIMENT_REGISTRY.md`. Machine-
readable: `phase27/results/phase27_experiments.json`. Decisions are
mechanical and verified by `phase27/tests/test_phase27_reproducibility.py`.

## Control (immutable Golden Reference)

| Split | Trades | Total R | PF | Win rate | maxDD |
|---|---|---|---|---|---|
| Train (≤ 2019-11-20) | 78 | +24.26 | 1.55 | 43.6% | −9 |
| Validation (… ≤ 2023-04-23) | 14 | −2.00 | 0.80 | 28.6% | −7 |
| Final (> 2023-04-23) — untouched until freeze | 23 | +10.00 | 1.83 | 47.8% | −4 |

## Candidate results and gate decisions

| Candidate | Train | Validation | Gate B | Gate E | Decision |
|---|---|---|---|---|---|
| C1 concurrency cap 1 | 56 tr, +16.26R, PF 1.51 | 10 tr, +2.00R, PF 1.33 | PASS (R>−2, n≥5) | PASS | **REJECTED — train R 16.26 < 17.00 floor** |
| C2 weekly separation ≥ 0.25% | 69 tr, +18.26R, PF 1.46 | 11 tr, −2.00R, PF 0.75 | FAIL (validation R not > −2.00) | PASS | **REJECTED** |
| C3 ATR percentile ≥ 0.10 | 58 tr, +17.18R, PF 1.52 | 8 tr, +4.00R, PF 2.00 | PASS | PASS | **FROZEN** |
| C4 concurrency cap 2 | 72 tr, +24.26R, PF 1.61 | 14 tr, −2.00R, PF 0.80 | FAIL (validation R not > −2.00) | PASS | **REJECTED** |
| C5 quality combo (C2 ∧ C3) | 33 tr, +10.18R, PF 1.86 | 5 tr, +4.00R, PF 2.00 | FAIL (train R 10.18 < 17.00) | PASS | **REJECTED** |

All candidates passed Gates A (no test contamination — thresholds
pre-registered from train+validation evidence), D (structural/single
pre-registered threshold), F (economic plausibility), G (deterministic).

Gate B notes: C1 improved validation (+2.00R vs −2.00R) but cut train R
below the 70% floor — recorded as a rejection, not tuned. C4 left validation
untouched (−2.00R) and was rejected. No candidate was re-run with adjusted
constants.

## Frozen candidate: C3_vol_percentile_floor

- Rule: drop signals whose trailing 100-bar ATR percentile (signal-inclusive,
  backward-looking) is below 0.10. Single pre-registered threshold;
  derivation: train+validation evidence only (the validation bucket's largest
  losers were its lowest-volatility entries; the below-decile cohort is the
  weakest cohort in the 27-D table). Execution rules untouched (filter-only
  candidate).
- Post-freeze final evaluation (reported as-is; NOT used for selection):
  **20 trades, +7.00R, PF 1.64, win rate 45.0%, maxDD −4.0** — versus the
  control final 23 trades, +10.00R, PF 1.83, maxDD −4.0.
- Interpretation: the frozen candidate's final-period evidence is **weaker
  than the control** on total R and PF, with equal maxDD. It remains frozen
  as a Phase-27 artifact (it passed the pre-registered gates), but the
  factual comparison below gives the owner the full picture.

## Factual comparison — control vs frozen C3 (no single-metric verdict)

| Dimension | Golden Reference | C3 frozen |
|---|---|---|
| PF (full) | 1.49 | (not evaluated full-period; frozen artifact) |
| Train R | +24.26 | +17.18 |
| Validation R | −2.00 | +4.00 |
| Final R (post-freeze) | +10.00 | +7.00 |
| Final PF | 1.83 | 1.64 |
| Final maxDD | −4.0 | −4.0 |
| Trades (full) | 115 | 66 train+val + 20 final = 86 |
| Cross-pair (27-E) | EURUSD-specific edge; GBP/JPY ≈ flat; AUD negative | same underlying signal (filter only) |
| Friction robustness (27-F) | PF ≥ 1.44 at 4 pips | inherits control execution |
| Yearly stability (train+val) | 11/18 positive years | 11/18 positive years |

## Outcome

**Outcome B — no robust improvement identified.** One candidate (C3) survived
the pre-registered gates and is formally frozen for the owner's review, but
its post-freeze final evaluation did not dominate the control, and the
diagnostics (27-B, 27-E, 27-G) show the control's edge is broadly
distributed, structurally friction-robust, and bracket-driven. The Golden
Reference remains the research control. Per the specification, Outcome B is a
legitimate result and prevents unnecessary optimization.

## Artifact hashes (reproducibility)

| Artifact | SHA-256 |
|---|---|
| `phase27/results/phase27_baseline_trades.csv` | `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0` (= historical ledger) |
| `phase27/results/phase27_enriched_trades.csv` | `ed54d67943861190a7c34c66204fce583f39533d5c51e295e623f359c7a433d2` |
| `phase27/results/phase27_diagnostics.json` | `6cffbe8c397971e28643a03162db7e1b0e6b8c9c39e86e070e422069cae8c056` |
| `phase27/results/phase27_experiments.json` | `53e20772f53400e5896de0625ec7e140bcbba5534509e7cfdeb313c80c68b3ff` |
| `phase27/results/phase27_baseline_summary.json` | `7fae9ef3cae3d9baafa441587d568f1017100427db01970e89ff74793045f9da` |

Environment: Python 3.14.7, pandas 3.0.6, numpy 2.5.3 (repository env);
Golden Reference additionally cross-verified under Python 3.12.14 / pandas
3.0.2 / numpy 2.4.4. Commands: `uv run python phase27/phase27_baseline.py`,
`uv run python phase27/phase27_diagnostics.py`,
`uv run python phase27/phase27_experiments.py`,
`uv run python -m unittest discover -s phase27/tests`.
