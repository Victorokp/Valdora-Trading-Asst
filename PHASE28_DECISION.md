# PHASE28_DECISION.md

## Decision state

**STATE A — VALIDATION SUPPORTS CONTINUATION.**

The predefined validation evidence does not reveal a decisive contradiction.
This does NOT mean the strategy is proven profitable in the future; it means
the untouched Golden Reference behaved out-of-sample consistently with its
historical expectation under every check Phase 28 ran, with the limitations
below recorded honestly.

## Evidence balance

Supporting continuation:

- OOS (walk-forward test years 2010–2025): **76 trades, +32.26R, PF 1.81,
  win rate 47.4%, max DD −12.0R** — the strongest validation cohort to date,
  produced by a strategy frozen before this cohort was measured.
- 11/16 test windows ≥ 0 (8 positive, 2 zero-signal, 5 losing); pooled
  positive; cumulative test R excluding the best window +21.26R, excluding
  the best two +13.26R — not carried by one or two windows.
- Zero leakage: 76/76 signals reproduce from data truncated at each signal
  day; 76/76 entries exact next-open + 1.5 pips; split boundaries exact;
  all artifact hashes unchanged; results byte-reproducible.
- No single-trade dependence: top OOS winner is 3% of gross profit; removing
  the best 10 OOS trades leaves +12.00R.
- Bootstrap: 99.2% of resamples positive; the observed result is not a
  narrow accident of the sample.

Recorded against continuation (limitations, not contradictions):

- **Small per-window/per-year samples**: only one test year reached 13
  trades; two years had zero signals. Window-level evidence is thin even
  where pooled evidence is not.
- **Regime dependence is real**: mid-volatility entries and the widest
  daily-trend tercile carried most of the OOS edge; low-volatility entries
  lost money OOS. The strategy is not regime-blind (documented, NOT acted
  on).
- **Cross-pair transfer remains undemonstrated**: GBP/JPY marginally
  positive, AUDUSD negative OOS. EURUSD remains the only instrument with
  validated evidence.
- **Realized −12R max DD is an unfavorable ordering** (~5th percentile of
  permutations of the same OOS set; median −6R). Future drawdowns should be
  expected to exceed typical-ordering levels regularly.
- The 2010–2025 OOS slice outperformed the full-history profile (PF 1.81 vs
  1.49); part of that strength is the same period strength already visible
  in-sample. This is disclosed rather than treated as additional alpha.

## Answers to primary questions (factual; details in the validation report)

Q1 positive aggregate across windows: **YES** (+32.26R pooled, PF 1.81).
Q2 stability across time: **MODERATE** (10/14 traded years positive;
2020–2021 negative stretch; two zero-signal years).
Q3 dependence on few trades: **LOW-MODERATE** (top-10 removal leaves +12R;
but yearly n is small).
Q4 regime dependence: **YES, material** (volatility and trend-separation
cohorts differ strongly; descriptive only).
Q5 evidence outside EURUSD: **WEAK** (GBP/JPY marginal, AUD negative).
Q6 OOS drawdown distribution: median −6R, p5 −10R, realized −12R (unfavorable
ordering).
Q7 OOS vs historical benchmark: **NO material contradiction**; OOS slice
stronger than full-history profile, with the period-strength caveat noted.
Q8 leakage/implementation concerns: **NONE found** (all audits PASS).

## Deferred research questions (NOT fixed in Phase 28, per §25)

1. Low-volatility signal cohort loses OOS (−2R on 5 trades; weakest
   in-sample cohort too) — candidate hypothesis for a FUTURE discovery
   phase, not acted on.
2. Daily trend-separation tercile showed the strongest OOS gradient —
   descriptive; any filter idea belongs to a future discovery phase with
   fresh gates.
3. Cross-pair weakness (especially AUDUSD) — unexplained; no pair-specific
   parameterization attempted.
4. Zero-signal years (2019, 2022) — worth understanding, not fixing.

## Hard stop honored

Phase 29 NOT started. Golden Reference NOT modified. C3 NOT modified.
No optimization, no new filters/indicators/parameters/rules, no
interpretation of positive OOS performance as proof of future
profitability.

## Reproducibility

- Branch: `phase28-validation` (main untouched at `79f86813…`)
- Phase-28 commit: recorded in the final response (commit containing these
  artifacts)
- Commands: `uv run python phase28/phase28_walk_forward.py`,
  `uv run python phase28/phase28_statistics.py`,
  `uv run python phase28/phase28_validation.py`,
  `uv run python -m unittest discover -s phase28/tests` (9/9 OK),
  `uv run python -m unittest discover -s tests` (15/15 OK)
