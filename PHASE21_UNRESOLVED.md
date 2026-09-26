# Phase-21 Unresolved Semantics

This file is intentionally explicit. The items below are not executed by the
Phase-21 core engine and must not be inferred from historical benchmarks.

## Not implemented yet

1. **16-window walk-forward execution**
   - The dates are known: T=2010 through T=2025, with train T-6 through T-2,
     validation T-1, and test T.
   - It is not yet defined whether the three phases are replayed continuously
     or independently, whether train is context-only, how capital and
     positions reset, or how trades crossing boundaries are assigned.
   - No walk-forward result is claimed by this stage.

2. **V1-V13 reconciliation**
   - The names, formulas, expected values, and roles of V1-V13 were not
     supplied in the active specification.
   - No V1-V13 values are invented or inferred.

3. **ADX14**
   - ADX is information-only, but the exact directional-movement, smoothing,
     seed, and alignment convention was not supplied.
   - The trade ledger contains an `ADX14` column filled with `NaN`.
   - No ADX implementation is executed.

4. **Drawdown and equity**
   - No convention was supplied for closed-trade R equity versus mark-to-market
     equity, daily sampling, initial capital, sign, or treatment of open trades.
   - Maximum drawdown is reported as pending.

5. **70/15/15 split assignment**
   - Calendar-time splitting is known, but cutoff rounding and inclusivity are
     not specified.
   - No split membership or split statistics are emitted.

## Explicitly out of scope

- V1 strategy modification or optimization.
- Tolerance gates or benchmark-driven parameter changes.
- Phase 26.
- Phase 27.
- Fabrication of missing pair data.

## Current data availability

- EUR/USD is available through `eurusd_daily.csv`.
- GBP/USD is supported generically but unavailable until `gbpusd_d.csv` or
  `gbpusd_daily.csv` is supplied.
- AUD/USD and USD/JPY are also reported unavailable when their files are
  absent.