# Application services

Typed service contracts only (32D) — no business logic, no I/O, no research
access, no live providers.

## Contracts (`index.ts`)

MarketDataService · AnalysisService · SignalService · StrategyService ·
RiskService · TradeJournalService · PerformanceService · ResearchService ·
NotificationService · AIService (+ raw `MarketDataProvider` abstraction).

`ServiceResult<T>` (from `@/domain/errors`) is the shared result/error model —
SUCCESS plus nine failure statuses; research-integrity failures
(`INTEGRITY_ERROR`) are distinct from ordinary provider failures. `toUIState`
maps results onto the five required UI states (LOADING/SUCCESS/EMPTY/ERROR/
UNAVAILABLE).

## Boundary rules

- `ResearchService` is the **only** reader of the frozen research evidence
  (artifact + commit + hash references out; no Python imports, no frozen-file
  reads from React).
- `AIService` is the only component that may ever talk to AI providers; it
  accepts structured `AIContext` and returns structured `AIResponse` metadata.
  AI is an explanation layer and can never become the source of truth.
- `TradeJournalService` stores what the user reports; it never computes
  strategy logic. `PerformanceService` keeps user performance and historical
  research performance on separate surfaces.
- Trading calculations never live in UI components.

Implementations arrive in later workstreams (persistence 32E, market data 32F,
research viewer 32G/H, AI 32I).
