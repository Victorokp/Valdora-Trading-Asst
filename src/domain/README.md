# Domain layer

Pure TypeScript domain model (32D). No I/O, no UI dependencies, no React, no
research imports, no network — deterministic helpers only.

## Areas

| Module | Contents |
|---|---|
| `ids.ts` | Branded opaque IDs (StrategyId, SignalId, TradeId, …) |
| `errors.ts` | ServiceResult / ServiceError with ten statuses incl. INTEGRITY_ERROR |
| `types.ts` | Compatibility surface: Direction, DataState, session status, re-exports |
| `instruments/` | Instrument model; **declared** pip sizes (never price-inferred) |
| `market/` | Timeframe (daily/weekly canonical, intraday-ready), MarketBar + OHLC validation, MarketSnapshot (explicit unknowns), IndicatorValue (results only, no engines) |
| `analysis/` | Observations (measured) separated from Interpretations (neutral) |
| `strategy/` | Strategy + immutable StrategyVersion with research provenance |
| `signals/` | Six-state signal lifecycle (NONE…EXPIRED), fully traceable, no generation |
| `research/` | EvidenceState (exactly six neutral states), ResearchRef provenance, Phase-30 readiness (PENDING — honest) |
| `risk/` | RiskStatus/GuardrailStatus (NORMAL/WARNING/BLOCKED/UNKNOWN), guardrails, exposure/drawdown summaries |
| `trading/` | ExecutionTiming (Phase-29-informed, no robustness claims), PlannedTrade vs ExecutedTrade |
| `performance/` | UserTradePerformance vs HistoricalResearchPerformance — never mixed |
| `provenance/` | Reusable Provenance record; `UNPROVENANCED` explicit marker |
| `ai/` | AIContext/AIResponse — AI receives citations only, structurally never a source of truth |
| `notifications/` | Typed notification model (no delivery) |
| `preferences/` | Display preference contract (no persistence) |

## Rules

- Research evidence, strategy versions, provenance and historical performance
  are `readonly` structures.
- No banned vocabulary is representable (no scores/stars/grades in evidence;
  no "guaranteed"/"robust" claims anywhere).
- Strategy/risk/signal *calculation engines* arrive in 32E–32F as isolated,
  testable modules with a determinism contract: identical `market data +
  strategy configuration + strategy version` ⇒ byte-identical results.
