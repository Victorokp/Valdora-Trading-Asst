# PHASE28_STATISTICS.md

## OOS descriptive statistics (§21) — 76 trades (entry years 2010–2025)

| Statistic | Value |
|---|---|
| n | 76 |
| mean R | +0.4244 |
| median R | −1.00 |
| std R | 1.5116 |
| skewness | +0.1082 |
| win rate | 47.37% |
| payoff ratio (avg win / avg loss) | 2.007 |
| profit factor | 1.8064 |
| expectancy | +0.4244 R/trade |
| max drawdown | −12.00R |
| maximum losing streak | 7 |

Reading guards (per §21): positive statistics are **not** claimed to be
statistically significant. The distribution remains the structural binary
of the 1:2 bracket (median trade is a full stop-out; the edge is carried by
the ~47% of trades reaching ≈ +2R). Payoff ≈ 2.0 with win rate ≈ 47% yields
PF ≈ 1.81 exactly as the bracket arithmetic implies; the strategy's
economics are bracket-driven, with signal selection deciding exposure.

The median R of −1.00 with positive expectancy means **more losing trades
than winners** (52.6% vs 47.4%); the system profits because winners are
twice the size of losers. Streaks of 5–7 consecutive losses are normal for
this win rate (Monte Carlo median streak 6) and are not evidence of regime
failure by themselves.

## Uncertainty statements (descriptive, not predictive)

- **Bootstrap** (10,000 resamples, seed 20280926): mean R 95% band
  [+0.105, +0.745]; total R [+8.00, +56.60]; max DD [−13.0, −3.0]; 0.79% of
  resamples negative. This quantifies sensitivity of the observed OOS
  result to which 76 trades occurred — **it is not a prediction interval
  for future performance.**
- **Monte Carlo order test** (10,000 permutations, seed 20280927): realized
  −12R max DD is worse than ~95% of orderings of the same trade set
  (median −6R). Risk planning for this strategy should anticipate
  drawdowns well beyond the realized figure's typical-ordering level.
- **Sample-size guard**: 14 of 16 test years traded, most with < 10 trades;
  two years (2019, 2022) had zero signals. Year-level statistics are
  reported with trade counts and small-sample flags; no strong conclusion
  is drawn from any single year (§11).

## Artifact hash register (§29)

| Artifact | SHA-256 |
|---|---|
| Golden Reference `phase21_historical_reference.py` | `b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95` |
| Dataset `eurusd_d.csv` | `e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52` |
| Historical ledger (gate-checked each run) | `30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0` |
| `phase28/results/PHASE28_WALK_FORWARD_RESULTS.csv` | `892d45c375f3553c3cf9bcabcfb075601a6d1e4e5e1c3ddd724850ccf1fb485a` |
| `phase28/results/PHASE28_OOS_TRADES.csv` | `f505620478c49c81bd422b4d488ae25a387b2d6a65fb019c792d6c824adea06b` |
| `phase28/results/PHASE28_OOS_EQUITY.csv` | `938d7053f02658da7497c80f6095e43fcebc5ca73897a278a975ca2c7de37c64` |
| `phase28/results/phase28_wf_summary.json` | `2763419ccaffe71138e22e5d83a8709a9b1bd6d9645166bf799d3579f3d20a13` |
| `phase28/results/phase28_statistics.json` | `4f70d84c8d561b864a712d450be0495fd043a94ef896658d286a62e75cdf95d8` |
| `phase28/results/phase28_validation.json` | `6457419b47ecf24ada0f4c4fc73de189bc61e4a981dbd12deb0dbe5e641667b0` |

Environment: Python 3.14.7 · pandas 3.0.6 · numpy 2.5.3. Seeds: bootstrap
20280926; Monte Carlo 20280927. Code commit: see `PHASE28_DECISION.md`
(Phase-28 commit SHA). All deterministic outputs re-verified byte-for-byte
(`phase28/tests/test_phase28_gates.py::test_10`).
