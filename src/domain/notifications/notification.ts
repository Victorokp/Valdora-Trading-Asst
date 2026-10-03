/**
 * Notification domain (32D).
 *
 * A minimal typed notification record. Delivery (channels, scheduling,
 * push) is explicitly out of scope — this is the vocabulary + shape only.
 *
 * Wording rule (architecture Part 2 §24): notification *types* are neutral
 * ("setup detected", never "trade now for profit"); the type union makes
 * loaded categories unrepresentable.
 *
 * Pure domain: no delivery, no scheduling, no persistence.
 */

export const NOTIFICATION_TYPES = [
  "SIGNAL_DETECTED",
  "SIGNAL_INVALIDATED",
  "RISK_LIMIT_REACHED",
  "TRADE_REMINDER",
  "JOURNAL_REMINDER",
  "RESEARCH_UPDATE",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ["INFO", "CAUTION", "CRITICAL"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/**
 * A single notification. References point at the entity it concerns
 * (opaque strings; the application layer interprets them).
 */
export interface Notification {
  readonly id: string;
  readonly type: NotificationType;
  readonly severity: NotificationSeverity;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  readonly title: string;
  readonly message: string;
  /** What the notification is about, as an opaque typed reference. */
  readonly relatedEntity?: {
    readonly kind: "SIGNAL" | "TRADE" | "RISK" | "RESEARCH";
    readonly id: string;
  };
  readonly read: boolean;
}
