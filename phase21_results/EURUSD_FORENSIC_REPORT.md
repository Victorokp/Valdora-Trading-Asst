# EUR/USD Phase-21 Forensic Report

Status: CORE EXECUTION COMPLETE; FORENSIC RECONCILIATION PARTIAL.

This report contains the deterministic EUR/USD core trade output. It does not claim that unresolved forensic semantics have been completed.

## Execution environment

- Branch: `main`
- Commit: `07519ee4c132092c8de1468c867975bceb9565d2`
- Python: 3.14.7
- pandas: 3.0.6
- numpy: 2.5.3
- Command: `uv run python phase21_reconstruction.py`

## Available observed metrics

```json
{
  "trades": 141,
  "win_rate": 36.87943262411347,
  "gross_profit_R": 104.26436532110807,
  "gross_loss_R": 89.17524283507069,
  "profit_factor": 1.1692075289769008,
  "total_R": 15.089122486037388,
  "average_R": 0.10701505309246374,
  "median_R": -0.999999999999995,
  "maximum_losing_streak": 10,
  "open_at_end_count": 0,
  "maximum_drawdown": "PENDING_UNRESOLVED_EQUITY_CONVENTION"
}
```

## Required but unresolved metrics

- Maximum drawdown/equity curve: PENDING; no equity convention was supplied.
- 16-window walk-forward execution: PENDING; only the date structure is specified.
- V1-V13 reconciliation: PENDING; definitions were not supplied.
- ADX14: PENDING; no ADX implementation is executed and trade values remain NaN.
- 70/15/15 split membership: PENDING; boundary rounding/inclusivity is unresolved.

## Benchmark handling

Historical benchmark figures are forensic references only. They are not used as tolerance gates, optimization targets, or parameter-selection inputs.

## Artifacts

- `eurusd_phase21_trades.csv`: deterministic core trade ledger.
- `EURUSD_first_last_10_trades.csv`: first and last ten ledger rows.
- `phase21_data_audit.csv`: available and unavailable pair sources.
- `PHASE21_FULL_FORENSIC_REPORT.md`: full four-pair forensic report.
- `PHASE21_IMPLEMENTATION_FINGERPRINT.md`: implemented-rule fingerprint.
- `PHASE21_UNRESOLVED.md`: unresolved semantics and explicit exclusions.
