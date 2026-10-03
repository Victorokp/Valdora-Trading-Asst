/**
 * Performance engine (32N) — service-layer computation over ExecutedTrade
 * records only.
 *
 * Builds on the domain's `compileUserPerformance`: this module adapts the
 * user's journal (ExecutedTrade records) into UserTradeOutcome rows and
 * computes the aggregate. Empty journals produce a zero-shaped summary whose
 * MEANING ("no trades yet — not a 0% win rate") is carried by the separate
 * `hasTrades` flag so the UI can render the honest empty state instead of a
 * misleading statistic.
 *
 * HistoricalResearchPerformance is NEVER produced here: it enters only via
 * the ResearchService boundary with its own cited source and limitations.
 */
import { compileUserPerformance, type UserTradeOutcome, type UserTradePerformance } from "@/domain/performance/performance";
import type { ExecutedTrade } from "@/domain/trading/trade";

/** Performance summary plus the explicit "is this meaningful" flag. */
export interface PerformanceSummary {
  readonly hasTrades: boolean;
  readonly performance: UserTradePerformance;
}

/** Convert one closed ExecutedTrade into a performance outcome row. */
export function outcomeFromTrade(trade: ExecutedTrade): UserTradeOutcome | null {
  if (trade.exitAt === undefined || trade.realizedR === undefined) return null; // still open / incomplete
  const outcome = trade.realizedR > 0 ? "WIN" : trade.realizedR < 0 ? "LOSS" : "BREAKEVEN";
  return { tradeId: trade.id, outcome, realizedR: trade.realizedR, exitAt: trade.exitAt };
}

/** Compute user performance from executed trades (closed trades only). */
export function computeUserPerformance(
  trades: readonly ExecutedTrade[],
  computedAt: string,
): PerformanceSummary {
  const outcomes = trades
    .map(outcomeFromTrade)
    .filter((o): o is UserTradeOutcome => o !== null)
    .sort((a, b) => a.exitAt.localeCompare(b.exitAt));
  return {
    hasTrades: outcomes.length > 0,
    performance: compileUserPerformance(outcomes, computedAt),
  };
}
