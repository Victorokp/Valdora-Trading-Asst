/**
 * Performance snapshots (32E).
 *
 * A user-owned, point-in-time capture of their own trading performance.
 * Snapshots are computed FROM the user's journal (via compileUserPerformance)
 * and stored for later comparison — they are never research numbers.
 */
import type { PerformanceSnapshotId } from "@/domain/ids";
import type { UserTradePerformance } from "@/domain/performance/performance";

export interface PerformanceSnapshot {
  readonly id: PerformanceSnapshotId;
  /** ISO-8601 time the snapshot was taken. */
  readonly takenAt: string;
  /** The summarized user performance at that time. */
  readonly performance: UserTradePerformance;
  /** Optional user note (e.g. "end of Q3 review"). */
  readonly note?: string;
}
