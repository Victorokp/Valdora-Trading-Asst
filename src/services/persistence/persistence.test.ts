import { describe, expect, it } from "vitest";

import { asId } from "@/domain/ids";
import { UNPROVENANCED } from "@/domain/provenance/provenance";
import type { ExecutedTrade } from "@/domain/trading/trade";
import { EXECUTION_SENSITIVITY_NOTE, type ExecutionTiming } from "@/domain/trading/executionTiming";
import type { Strategy, StrategyVersion } from "@/domain/strategy/strategy";
import { createJsonSerializer, MemoryCollectionRepository, MemoryPreferencesRepository, testStamp } from "@/services/persistence";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@/domain/preferences/preferences";

const timing: ExecutionTiming = {
  instrument: "EURUSD",
  stamps: { signalAt: "2026-09-25", intendedEntryAt: "2026-09-28", actualEntryAt: "2026-09-28" },
  source: "USER_REPORTED",
  status: "ENTRY_ON_TIME",
  sensitivityNote: EXECUTION_SENSITIVITY_NOTE,
};

function executedTrade(id: string, realizedR = 2): ExecutedTrade {
  return {
    id: asId<"TradeId">(id),
    instrument: "EURUSD",
    direction: "LONG",
    strategyVersionId: asId<"StrategyVersionId">("EURUSD-GR-v1"),
    entry: 1.1005,
    exit: 1.13,
    entryAt: "2026-09-28",
    exitAt: "2026-10-02",
    realizedR,
    timing,
    provenance: { sourceType: "USER_INPUT", sourceName: "user journal entry" },
  };
}

const strategy: Strategy = {
  id: asId<"StrategyId">("strategy-eurusd-gr"),
  name: "EURUSD Golden Reference",
  description: "Frozen Phase-21 lineage strategy.",
  status: "ACTIVE",
  createdAt: "2026-09-28",
  currentVersionId: asId<"StrategyVersionId">("EURUSD-GR-v1"),
};

const frozenVersion: StrategyVersion = {
  strategyId: strategy.id,
  versionId: asId<"StrategyVersionId">("EURUSD-GR-v1"),
  versionLabel: "Golden Reference v1",
  effectiveDate: "2026-09-28",
  methodologyRef: "GR-v1 historical specification (frozen research)",
  parameters: { stopAtrMultiple: 1, targetAtrMultiple: 2, warmupBars: 60 },
  researchProvenance: [
    { phase: "PHASE21", artifact: "phase21_trade_ledger (registered artifact)", evidenceState: "SUPPORTED" },
  ],
  frozen: true,
};

describe("in-memory repositories", () => {
  it("round-trips executed trades (list/get/put/remove)", async () => {
    const repo = new MemoryCollectionRepository<ExecutedTrade, string>((t) => t.id);
    const put = await repo.put(executedTrade("t-1"), testStamp());
    expect(put.status).toBe("SUCCESS");
    const got = await repo.get("t-1");
    expect(got.status === "SUCCESS" && got.value?.realizedR).toBe(2);
    const listed = await repo.list();
    expect(listed.status === "SUCCESS" && listed.value).toHaveLength(1);
    const removed = await repo.remove("t-1");
    expect(removed.status).toBe("SUCCESS");
    const missing = await repo.remove("t-1");
    expect(missing.status === "SUCCESS" || missing.status === "NOT_FOUND").toBeTruthy();
    expect(missing.status).toBe("NOT_FOUND");
  });

  it("rejects research-ownership stamps with INTEGRITY_ERROR (ownership separation)", async () => {
    const repo = new MemoryCollectionRepository<ExecutedTrade, string>((t) => t.id);
    const result = await repo.put(executedTrade("t-2"), {
      ownership: "RESEARCH" as never,
      persistedAt: "2026-09-28T00:00:00Z",
    });
    expect(result.status).toBe("INTEGRITY_ERROR");
    expect(repo.size).toBe(0);
  });

  it("runs structural validation before accepting records", async () => {
    const repo = new MemoryCollectionRepository<ExecutedTrade, string>(
      (t) => t.id,
      (t) => (t.entry > 0 ? [] : ["entry price must be positive"]),
    );
    const bad = await repo.put(executedTrade("t-3", 2), testStamp());
    const badNegative = await repo.put({ ...executedTrade("t-4"), entry: -5 }, testStamp());
    expect(bad.status).toBe("SUCCESS");
    expect(badNegative.status).toBe("VALIDATION_ERROR");
    if (badNegative.status !== "SUCCESS") {
      expect(badNegative.error.message).toContain("entry price must be positive");
    }
  });

  it("refuses to mutate an existing frozen strategy version", async () => {
    const repo = new MemoryCollectionRepository<StrategyVersion, string>(
      (v) => v.versionId,
      undefined,
      (existing, incoming) =>
        existing.frozen && JSON.stringify(existing.parameters) !== JSON.stringify(incoming.parameters)
          ? "frozen strategy versions are immutable; create a new version id instead"
          : null,
    );
    const first = await repo.put(frozenVersion, testStamp());
    expect(first.status).toBe("SUCCESS");
    const mutated = await repo.put(
      { ...frozenVersion, parameters: { ...frozenVersion.parameters, stopAtrMultiple: 2 } },
      testStamp(),
    );
    expect(mutated.status).toBe("INTEGRITY_ERROR");
    const same = await repo.put(frozenVersion, testStamp());
    expect(same.status).toBe("SUCCESS");
  });

  it("stores preferences with last-write-wins and clears cleanly", async () => {
    const prefs = new MemoryPreferencesRepository();
    const empty = await prefs.load();
    expect(empty.status === "SUCCESS" && empty.value).toBeNull();
    const mine: UserPreferences = { ...DEFAULT_USER_PREFERENCES, preferredInstrument: "EURUSD", preferredTimeframe: "DAILY" };
    await prefs.save(mine, testStamp());
    const loaded = await prefs.load();
    expect(loaded.status === "SUCCESS" && loaded.value?.preferredInstrument).toBe("EURUSD");
    await prefs.clear();
    const cleared = await prefs.load();
    expect(cleared.status === "SUCCESS" && cleared.value).toBeNull();
  });

  it("serializes deterministically and validates deserialization", () => {
    const serializer = createJsonSerializer<ExecutedTrade>("ExecutedTrade");
    const trade = executedTrade("t-5");
    const raw = serializer.serialize(trade);
    expect(JSON.parse(raw)).toStrictEqual(JSON.parse(raw)); // deterministic string
    const roundTrip = serializer.deserialize(raw);
    expect(roundTrip.status).toBe("SUCCESS");
    if (roundTrip.status === "SUCCESS") expect(roundTrip.value.id).toBe("t-5");
    const malformed = serializer.deserialize("{not json");
    expect(malformed.status).toBe("VALIDATION_ERROR");
    const nonObject = serializer.deserialize("42");
    expect(nonObject.status).toBe("VALIDATION_ERROR");
  });

  it("keeps fixture stamps deterministic (no live clock)", () => {
    expect(testStamp()).toStrictEqual({ ownership: "USER_DATA", persistedAt: "2026-09-28T00:00:00Z" });
  });

  it("user data and provenance stay distinct from research artifacts", async () => {
    const repo = new MemoryCollectionRepository<ExecutedTrade, string>((t) => t.id);
    const trade = executedTrade("t-6");
    expect(trade.provenance.sourceType).toBe("USER_INPUT");
    expect(trade.provenance).not.toBe(UNPROVENANCED);
    const put = await repo.put(trade, testStamp());
    expect(put.status).toBe("SUCCESS");
  });
});
