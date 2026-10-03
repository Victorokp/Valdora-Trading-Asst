import { describe, expect, it } from "vitest";

import { asId, type SignalId, type StrategyId, type TradeId } from "@/domain/ids";

describe("typed opaque IDs", () => {
  it("wraps raw strings without altering the value", () => {
    const strategyId: StrategyId = asId<"StrategyId">("strategy-eurusd-gr");
    expect(strategyId).toBe("strategy-eurusd-gr");
  });

  it("produces distinguishable branded types", () => {
    const strategyId: StrategyId = asId<"StrategyId">("id-1");
    const signalId: SignalId = asId<"SignalId">("id-1");
    const tradeId: TradeId = asId<"TradeId">("id-1");
    // Runtime values may coincide; the types do not (compile-time separation).
    expect([strategyId, signalId, tradeId]).toStrictEqual(["id-1", "id-1", "id-1"]);
  });
});
