import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_TYPES,
  type Notification,
} from "@/domain/notifications/notification";

describe("notifications", () => {
  it("supports exactly the six neutral notification types", () => {
    expect([...NOTIFICATION_TYPES]).toStrictEqual([
      "SIGNAL_DETECTED",
      "SIGNAL_INVALIDATED",
      "RISK_LIMIT_REACHED",
      "TRADE_REMINDER",
      "JOURNAL_REMINDER",
      "RESEARCH_UPDATE",
    ]);
  });

  it("supports the three severities", () => {
    expect([...NOTIFICATION_SEVERITIES]).toStrictEqual(["INFO", "CAUTION", "CRITICAL"]);
  });

  it("creates a notification with entity reference and read state", () => {
    const n: Notification = {
      id: "n-1",
      type: "SIGNAL_DETECTED",
      severity: "INFO",
      createdAt: "2026-09-28T00:00:00Z",
      title: "Setup detected",
      message: "A EURUSD daily setup condition was observed.",
      relatedEntity: { kind: "SIGNAL", id: "signal-1" },
      read: false,
    };
    expect(n.read).toBe(false);
    expect(n.relatedEntity?.kind).toBe("SIGNAL");
    expect(n.title).toMatch(/setup detected/i);
    expect(n.title.toLowerCase()).not.toContain("trade now for profit");
  });
});
