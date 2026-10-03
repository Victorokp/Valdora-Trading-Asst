/**
 * Performance domain (32D).
 *
 * Two strictly separated performance concepts:
 *
 * - `HistoricalResearchPerformance` — read-only numbers from frozen research
 *   artifacts (e.g. the Golden Reference benchmark). Always carries its
 *   ResearchRef and limitations.
 * - `UserTradePerformance` — computed only from the user's own journal.
 *
 * They must NEVER be mixed: no shared chart, table or summary. The type
 * system enforces the boundary (distinct, non-interchangeable shapes).
 */
import type { ResearchRef } from "@/domain/research/evidence";

/** Direction of a user trade outcome. */
export type TradeOutcomeDirection = "WIN" | "LOSS" | "BREAKEVEN";

/** One closed user trade as performance sees it. */
export interface UserTradeOutcome {
  readonly tradeId: string;
  readonly outcome: TradeOutcomeDirection;
  /** Realized R (positive for wins, negative for losses, 0 breakeven). */
  readonly realizedR: number;
  /** ISO-8601 exit time (ordering for streaks/drawdown). */
  readonly exitAt: string;
}

/** Performance computed ONLY from the user's journal. */
export interface UserTradePerformance {
  readonly totalTrades: number;
  readonly wins: number;
  readonly losses: number;
  /** Fraction 0..1. */
  readonly winRate: number;
  readonly totalR: number;
  readonly averageR: number;
  /** Gross profit / gross loss; undefined when no losses are recorded. */
  readonly profitFactor?: number;
  /** Most negative cumulative-R drawdown (negative sign). */
  readonly maxDrawdownR: number;
  /** Longest run of consecutive losing trades. */
  readonly longestLosingStreak: number;
  /** Longest trades-underwater span (in trades), after the worst drawdown trough. */
  readonly recoveryDurationTrades?: number;
  /** Which journal entries this summarizes (traceability). */
  readonly fromTradeIds: readonly string[];
  /** When the summary was computed. */
  readonly computedAt: string;
}

/**
 * Performance measured by frozen research artifacts. Numbers arrive only
 * from a cited artifact; the domain never fabricates them.
 */
export interface HistoricalResearchPerformance {
  readonly totalTrades: number;
  readonly winRate: number;
  readonly profitFactor?: number;
  readonly totalR: number;
  readonly maxDrawdownR: number;
  readonly longestLosingStreak?: number;
  /** Where every number above came from. */
  readonly source: ResearchRef;
  /** Mandatory limitations displayed with the numbers. */
  readonly limitations: readonly string[];
}

/**
 * Compile user performance from journal outcomes. Deterministic; R-drawdown
 * follows the research convention (cum − running max, negative sign).
 */
export function compileUserPerformance(outcomes: readonly UserTradeOutcome[], computedAt: string): UserTradePerformance {
  if (outcomes.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalR: 0,
      averageR: 0,
      maxDrawdownR: 0,
      longestLosingStreak: 0,
      fromTradeIds: [],
      computedAt,
    };
  }
  const wins = outcomes.filter((o) => o.realizedR > 0).length;
  const losses = outcomes.filter((o) => o.realizedR < 0).length;
  const totalR = outcomes.reduce((sum, o) => sum + o.realizedR, 0);
  const grossWin = outcomes.filter((o) => o.realizedR > 0).reduce((s, o) => s + o.realizedR, 0);
  const grossLoss = Math.abs(outcomes.filter((o) => o.realizedR < 0).reduce((s, o) => s + o.realizedR, 0));

  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  let streak = 0;
  let longest = 0;
  for (const o of outcomes) {
    cum += o.realizedR;
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDD) maxDD = dd;
    if (o.realizedR <= 0) {
      streak += 1;
      if (streak > longest) longest = streak;
    } else {
      streak = 0;
    }
  }

  return {
    totalTrades: outcomes.length,
    wins,
    losses,
    winRate: wins / outcomes.length,
    totalR,
    averageR: totalR / outcomes.length,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : undefined,
    maxDrawdownR: maxDD,
    longestLosingStreak: longest,
    fromTradeIds: outcomes.map((o) => o.tradeId),
    computedAt,
  };
}
