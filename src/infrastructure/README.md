# Infrastructure layer

Reserved for future infrastructure adapters. **Intentionally empty in 32C.**

Planned (none implemented yet):

- `market-data/` — provider adapters (Twelve Data primary, Alpha Vantage
  fallback, Yahoo-cache pattern preserved as a research feed adapter) — 32D
- `database/` — persistence — 32J
- `auth/` — authentication — 32J
- `ai/` — server-side AI provider clients (keys never ship to the client) — 32I

The frozen research core is **not** part of this layer and is never imported
from the application. Research access goes through `ResearchService` (32H)
only, reading hash-verified artifacts.
