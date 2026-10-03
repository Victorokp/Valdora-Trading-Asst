import { describe, expect, it } from "vitest";

import { toUIState } from "@/services/index";
import { serviceFailure, serviceSuccess } from "@/domain/errors";
import type {
  AIService,
  AnalysisService,
  MarketDataService,
  NotificationService,
  PerformanceService,
  ResearchService,
  RiskService,
  SignalService,
  StrategyService,
  TradeJournalService,
} from "@/services/index";
import type { Phase30Readiness } from "@/domain/research/phase30";
import { PHASE30_CURRENT_READINESS } from "@/domain/research/phase30";

describe("service contracts are importable and type-safe", () => {
  it("exposes all ten service interfaces as types", () => {
    // Compile-time presence check: assign null-typed placeholders.
    const market: MarketDataService | null = null;
    const analysis: AnalysisService | null = null;
    const signals: SignalService | null = null;
    const strategy: StrategyService | null = null;
    const risk: RiskService | null = null;
    const journal: TradeJournalService | null = null;
    const performance: PerformanceService | null = null;
    const research: ResearchService | null = null;
    const notifications: NotificationService | null = null;
    const ai: AIService | null = null;
    expect([market, analysis, signals, strategy, risk, journal, performance, research, notifications, ai]).toStrictEqual(
      new Array(10).fill(null),
    );
  });

  it("maps a success result onto the UI state", () => {
    const readiness: Phase30Readiness = PHASE30_CURRENT_READINESS;
    const ui = toUIState(serviceSuccess(readiness));
    expect(ui.state).toBe("SUCCESS");
    expect(ui.data).toBe(readiness);
  });

  it("maps an empty success onto EMPTY via the caller's predicate", () => {
    const ui = toUIState(serviceSuccess<readonly string[]>([]), (v) => v.length === 0);
    expect(ui.state).toBe("EMPTY");
    expect(ui.data).toBeNull();
  });

  it("maps NOT_CONFIGURED / UNAVAILABLE / RATE_LIMITED onto UNAVAILABLE", () => {
    for (const status of ["NOT_CONFIGURED", "UNAVAILABLE", "RATE_LIMITED"] as const) {
      const ui = toUIState(serviceFailure<string>(status, "not ready"));
      expect(ui.state).toBe("UNAVAILABLE");
      expect(ui.error?.code).toBe(status);
    }
  });

  it("maps integrity and provider failures onto ERROR (distinct codes preserved)", () => {
    const integrity = toUIState(serviceFailure<string>("INTEGRITY_ERROR", "frozen artifact mismatch"));
    const provider = toUIState(serviceFailure<string>("PROVIDER_ERROR", "upstream down"));
    expect(integrity.state).toBe("ERROR");
    expect(integrity.error?.code).toBe("INTEGRITY_ERROR");
    expect(provider.state).toBe("ERROR");
    expect(provider.error?.code).toBe("PROVIDER_ERROR");
  });
});
