/**
 * Seeded strategy configuration (32J).
 *
 * The frozen Phase-21 Golden Reference lineage as APPLICATION CONFIGURATION:
 * parameters mirror the versioned research provenance (never the executable
 * research code), and the rule set is a deterministic restatement for the
 * analysis engine to evaluate. The strategy version is immutable — any
 * change creates a new version id.
 *
 * NOT a re-implementation of the Golden Reference backtest: no research
 * module is imported, no frozen dataset is read, and no historical result is
 * recomputed. The rules below are declared conditions the deterministic
 * evaluator traces; historical evidence remains available only through the
 * ResearchService.
 */
import { asId, type StrategyId, type StrategyVersionId } from "@/domain/ids";
import type { Strategy, StrategyVersion } from "@/domain/strategy/strategy";
import { createStrategyVersion } from "@/domain/strategy/strategy";
import type { StrategyRuleSet } from "@/domain/strategy/rules";
import { RESEARCH_COMMITS } from "@/services/research/registry";

export const GR_STRATEGY_ID: StrategyId = asId<"StrategyId">("strategy-eurusd-gr");
export const GR_VERSION_ID: StrategyVersionId = asId<"StrategyVersionId">("EURUSD-GR-v1");

/** The frozen GR-v1 strategy entity. */
export const GR_STRATEGY: Strategy = {
  id: GR_STRATEGY_ID,
  name: "EURUSD Golden Reference",
  description:
    "Frozen Phase-21 lineage strategy (weekly regime + daily pullback). Configuration data only — the historical evidence stays in the Research viewer.",
  status: "ACTIVE",
  createdAt: "2026-09-28",
  currentVersionId: GR_VERSION_ID,
};

/** The immutable GR-v1 version: declared parameters + research provenance. */
export const GR_STRATEGY_VERSION: StrategyVersion = createStrategyVersion({
  strategyId: GR_STRATEGY_ID,
  versionId: GR_VERSION_ID,
  versionLabel: "Golden Reference v1",
  effectiveDate: "2026-09-28",
  methodologyRef: "GR-v1 historical specification (frozen research; Phase 21 reconstruction)",
  parameters: {
    weeklyEmaFast: 10,
    weeklyEmaSlow: 20,
    dailyEma: 20,
    atrPeriod: 14,
    stopAtrMultiple: 1,
    targetAtrMultiple: 2,
    warmupBars: 60,
    entryTiming: "NEXT_BAR_OPEN",
  } as Readonly<Record<string, string | number | boolean>>,
  researchProvenance: [
    {
      phase: "PHASE21",
      artifact: "Golden Reference executable specification (frozen)",
      evidenceState: "SUPPORTED",
      commit: RESEARCH_COMMITS.phase21GR,
    },
    {
      phase: "PHASE21",
      artifact: "Phase-21 trade ledger (frozen)",
      evidenceState: "SUPPORTED",
      commit: RESEARCH_COMMITS.phase21GR,
    },
  ],
  frozen: true,
  note: "Immutable lineage version. Any change creates a new version id — this record is never edited.",
});

/**
 * The GR-v1 rule set as configuration data evaluated by the deterministic
 * rule engine. The long side restates the frozen strategy semantics for the
 * evaluation engine; the short side is declared out of scope for this
 * version (the historical research is long-only), represented as an empty
 * rule set.
 */
export const GR_RULE_SET_LONG: StrategyRuleSet = {
  direction: "LONG",
  entryRules: [
    {
      id: "weekly-regime",
      label: "Weekly regime up",
      description: "The higher-timeframe regime favors the long side (declared GR-v1 semantics).",
      conditions: [
        { key: "dailyEma20", operator: "GT", thresholdKey: "dailyEma50", expected: "EMA20 above EMA50 on the evaluation timeframe" },
        { key: "close", operator: "GT", thresholdKey: "dailyEma20", expected: "close above EMA20" },
      ],
    },
    {
      id: "daily-pullback",
      label: "Daily pullback",
      description: "Price pulled back to the daily EMA without losing it.",
      conditions: [
        { key: "dailyLow", operator: "LTE", thresholdKey: "dailyEma20", expected: "bar low touched or fell below EMA20" },
        { key: "close", operator: "GT", thresholdKey: "dailyEma20", expected: "close back above EMA20" },
      ],
    },
  ],
  invalidationRules: [
    {
      id: "regime-lost",
      label: "Regime invalidated",
      description: "The close losing EMA50 ends the setup (requirement form: a FAIL of this condition is the invalidation trigger).",
      conditions: [{ key: "close", operator: "GT", thresholdKey: "dailyEma50", expected: "close stays above EMA50" }],
    },
  ],
  exitPlan: {
    stopAtrMultiple: 1,
    targetAtrMultiple: 2,
    description: "Stop 1×ATR14 below entry; target 2×ATR14 above entry; next-bar-open entry timing.",
  },
};

/** Short side: declared out of scope for GR-v1 (historical research is long-only). */
export const GR_RULE_SET_SHORT: StrategyRuleSet = {
  direction: "SHORT",
  entryRules: [],
  invalidationRules: [],
};
