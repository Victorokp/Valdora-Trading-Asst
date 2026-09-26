# PHASE29_EXPERIMENT_REGISTRY.md

Pre-registration: **all experiments below were frozen BEFORE execution.**
No experiment was added after seeing its result; no value was tuned toward
profitability. The control is the Phase-21 Golden Reference
(`phase21_historical_reference.py`, SHA `b0d84b15…454e95`) on
`eurusd_d.csv` (SHA `e0676d92…fd0d52`); the historical ledger
(`30d22be4…f70d0`) is the frozen trade set. Perturbations run on dedicated
stress engines / ledger transformations; the Golden Reference file itself is
never modified. This is a falsification attempt, not a search.

Generic interpretation scale (pre-registered, per family where noted):
- **HOLDS** — degradation gradual/consistent with expectation; conclusion unchanged.
- **DEGRADED-BUT-POSITIVE** — meaningful deterioration yet positive evidence remains.
- **FRAGILE** — small reasonable perturbation removes most/all of the edge or destabilizes the outcome.
- **BREAKS** — reasonable adverse assumption reverses or destroys the evidence.

## Family A — Execution stress (friction + adverse slippage)

| ID | Perturbation | Rationale | Affected | Expected stress | Metrics | Interpretation |
|---|---|---|---|---|---|---|
| A-FRIC | Entry friction grid: 0, 1.5 (control), 3, 4, 5, 6 pips | Extends Phase 27's curve into worse execution | entry price | monotone deterioration | trades, total R, PF, WR, maxDD, break-even region | HOLDS if edge positive through 4–6 pips; FRAGILE if it dies ≤ 3 pips |
| A-SLIP | Adverse one-way entry slippage 0.5 / 1.0 / 2.0 pips applied to the fill price IN ADDITION to 1.5-pip control friction (adverse-only; no favorable slippage) | Deterministic friction ≠ stochastic slippage; live fills worsen | entry price | monotone deterioration | same as A-FRIC | HOLDS if positive at 2.0 pips slippage |

## Family B — Entry delay

| ID | Perturbation | Rationale | Affected | Expected stress | Metrics | Interpretation |
|---|---|---|---|---|---|---|
| B-DELAY | Entry delayed 1 bar and 2 bars after signal (same signal set, same brackets from entry price) | Signals decay after the breakout bar; measures timing dependence | entry timing | deterioration, possibly larger than friction | total R, PF, WR, maxDD, trades | HOLDS if still positive at +1 bar; FRAGILE if +1 bar flips negative |

## Family C — Exit execution degradation

Fixed adverse exit slippage s ∈ {0.5, 1.0} pips on adverse exits only:

| ID | Treatment | Rationale |
|---|---|---|
| C-CONTROL | Golden Reference execution | baseline |
| C2-STOP | adverse s on stop exits (exit price worsened 1R-side) | stops fill worse in stress |
| C3-TGT | adverse s on target exits (exit price reduced) | targets rarely fill perfectly |
| C4-GAP | gap exits treated at the gap-through LEVEL (stop gap → stop price, target gap → target price) instead of the actual open | tests dependence on favorable gap fills |

Metrics: total R, PF, WR, maxDD, trades. Interpretation: HOLDS if PF stays
> 1.4 at s = 1.0 for C2/C3 and gap treatment costs < 25% of total R;
FRAGILE if any single adverse treatment removes > 50% of the edge.

## Family D — Parameter perturbation (sensitivity, NOT search)

Independent one-at-a-time perturbations; no combinations; no selection.

| ID | Perturbation | Interpretation (FRAGILE if outcome sign or PF stability collapses; HOLDS if PF remains in a narrow band around control) |
|---|---|---|
| D-STOP09 / D-STOP11 | stop 0.9 / 1.1 ATR (target 2.0 fixed) | bracket geometry sensitivity |
| D-TGT18 / D-TGT22 | target 1.8 / 2.2 ATR (stop 1.0 fixed) | payoff asymmetry sensitivity |
| D-E20m / D-E20p | daily EMA20 → 19 / 21 | signal-cohort stability |
| D-E50m / D-E50p | daily EMA50 → 49 / 51 | signal-cohort stability |
| D-W10m / D-W10p | weekly EMA10 → 9 / 11 | regime-filter stability |
| D-W20m / D-W20p | weekly EMA20 → 19 / 21 | regime-filter stability |

## Family E — Signal timing perturbation

| ID | Perturbation | Validity |
|---|---|---|
| E-LAG | signal condition evaluated one day LATER (shift signal series forward by 1 bar; entry stays next-open after the shifted signal — uses only past information at entry) | VALID (no look-ahead: a D+1-labeled signal uses data ≤ its own day) |
| E-LEAD | signal condition evaluated one day EARLIER (would require acting on a condition before its confirming close exists) | **NOT VALID — WOULD INTRODUCE LOOK-AHEAD → NOT RUN** |

Metrics: total R, PF, WR, maxDD, trades. Interpretation: HOLDS if PF remains
> 1; FRAGILE if a 1-day timing shift destroys the edge.

## Family F — Data / trade-omission stress

Runs on the frozen historical ledger (ledger-level transformation; no engine
re-run needed).

| ID | Perturbation | Rationale | Interpretation |
|---|---|---|---|
| F1 | remove top-1 / top-2 / top-5 / top-10 winners | concentration (extends Phase 27 with streak/PF) | FRAGILE if sign flips at any level |
| F2 | random trade omission 1% / 5% / 10%, seeds 29092601..29092620 (20 seeds each; pre-registered, not optimized) | sampling fragility | report distribution of total R and PF; FRAGILE if a material fraction goes negative |
| F3 | remove 10% / 20% of WINNING trades only (seeds as F2) | "edge without some winners" | FRAGILE if median total R < 0 |

## Family G — Trade-order stress

| ID | Perturbation | Details |
|---|---|---|
| G-MC | 10,000 order permutations, seed 20290926, identical outcomes | report median / p5 / p1 / p95 / worst maxDD, losing-streak distribution, P(maxDD worse than −12R) |

Interpretation: risk-envelope statistic; no pass/fail — compare with the
practical tolerance question in Family I.

## Family H — Exposure / concurrency stress (descriptive, NOT candidates)

| ID | Perturbation | Details |
|---|---|---|
| H1 | full historical concurrency | control |
| H2 / H3 / H4 | position caps 3 / 2 / 1 (greedy drop of later-entry trades beyond cap) | exposure-restriction sensitivity |

Metrics: trades, total R, PF, maxDD, avg/max concurrency, % time > 1
position, overlapping pairs. Interpretation: FRAGILE if a realistic cap
(H3) removes the edge; otherwise HOLDS/DEGRADED.

## Family I — Capital path / drawdown envelope

On the actual exit-order sequence and under G-MC orderings: drawdown counts
exceeding 5R / 8R / 10R / 12R / 15R, recovery lengths, worst peak-to-trough.
Interpretation: documents the practical tolerance envelope; no pass/fail.

## Family J — Temporal fragility

Per-window metrics from the 16 walk-forward windows (trades, R, PF, WR,
maxDD, avg R, losing streak); identify best/worst window, longest
zero-signal period, consecutive losing/profitable window runs.
Interpretation: HOLDS if positive windows are distributed across the
timeline rather than clustered in one era.

## Family K — Regime fragility

Control trades bucketed by entry-time volatility (low/mid/high) and trend
width (narrow/wide), pre-registered boundaries (vol: <0.5%, 0.5–1.0%,
>1.0% ATR/price; trend: EMA20−EMA50 gap terciles). Interpretation: HOLDS if
no regime cohort collapses to strongly negative with meaningful n; small
samples flagged at n < 10.

## Family L — Cross-pair stress (secondary)

Golden logic on GBPUSD / USDJPY / AUDUSD, full-history and OOS-2010–2025
slices, reported independently. No pooling; no per-pair tuning. Interpretation:
transfer remains weak per Phase 27/28; measure whether OOS slices stay
non-catastrophic.
