/**
 * TradeJournalService implementation (32L/32M).
 *
 * Owns the canonical trade lifecycle on top of USER_DATA repositories:
 * planned trades (derived, never executed by the app), executed trades
 * (user-reported fills only) and journal entries (user-authored text).
 *
 * Every stored record carries an ownership stamp with the local owner id —
 * no login exists yet, so ownership is honest local attribution, never a
 * fabricated account. The service never computes strategy logic and never
 * invents a fill: it stores what the user reports, as reported.
 */
import { asId } from "@/domain/ids";
import { serviceFailure, serviceSuccess, type ServiceResult } from "@/domain/errors";
import type { JournalEntry } from "@/domain/trading/journalEntry";
import type { ExecutedTrade, PlannedTrade } from "@/domain/trading/trade";
import type {
  ExecutedTradeRepository,
  JournalEntryRepository,
  OwnershipStamp,
  PlannedTradeRepository,
} from "@/services/persistence/repository";
import type { TradeJournalFilter, TradeJournalService } from "@/services/index";

/** Honest local owner id until an auth layer exists (never a fake login). */
export const LOCAL_OWNER_ID = "local-user";

/** Stamp factory: user data owned by the local user, persisted now. */
export function userStamp(now: () => string, ownerId: string = LOCAL_OWNER_ID): OwnershipStamp {
  return { ownership: "USER_DATA", ownerId, persistedAt: now() };
}

function validatePlannedTrade(trade: PlannedTrade): readonly string[] {
  const problems: string[] = [];
  if (!(trade.intendedEntry > 0) || !Number.isFinite(trade.intendedEntry)) problems.push("intendedEntry must be a positive number");
  if (!(trade.stopPrice > 0) || !Number.isFinite(trade.stopPrice)) problems.push("stopPrice must be a positive number");
  if (!(trade.targetPrice > 0) || !Number.isFinite(trade.targetPrice)) problems.push("targetPrice must be a positive number");
  return problems;
}

function validateExecutedTrade(trade: ExecutedTrade): readonly string[] {
  const problems: string[] = [];
  if (!(trade.entry > 0) || !Number.isFinite(trade.entry)) problems.push("entry must be a positive number");
  if (trade.exit !== undefined && (!(trade.exit > 0) || !Number.isFinite(trade.exit))) problems.push("exit must be a positive number when present");
  if (trade.entryAt === "") problems.push("entryAt is required");
  return problems;
}

function validateJournalEntry(entry: JournalEntry): readonly string[] {
  const problems: string[] = [];
  if (entry.title.trim() === "") problems.push("title must not be empty");
  if (entry.body.trim() === "") problems.push("body must not be empty");
  return problems;
}

export class TradeJournalServiceImpl implements TradeJournalService {
  private seq = 0;

  constructor(
    private readonly planned: PlannedTradeRepository,
    private readonly executed: ExecutedTradeRepository,
    private readonly journal: JournalEntryRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}-${this.now()}`;
  }

  async listPlannedTrades(filter?: TradeJournalFilter): Promise<ServiceResult<readonly PlannedTrade[]>> {
    const result = await this.planned.list();
    if (result.status !== "SUCCESS") return result;
    const filtered = result.value.filter(
      (t) =>
        (filter?.instrument === undefined || t.instrument === filter.instrument) &&
        (filter?.openOnly !== true || true), // planned trades are open by definition until discarded/executed
    );
    return serviceSuccess([...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async listExecutedTrades(filter?: TradeJournalFilter): Promise<ServiceResult<readonly ExecutedTrade[]>> {
    const result = await this.executed.list();
    if (result.status !== "SUCCESS") return result;
    const filtered = result.value.filter(
      (t) =>
        (filter?.instrument === undefined || t.instrument === filter.instrument) &&
        (filter?.openOnly === undefined || filter.openOnly === (t.exitAt === undefined)),
    );
    return serviceSuccess([...filtered].sort((a, b) => b.entryAt.localeCompare(a.entryAt)));
  }

  async getExecutedTrade(id: string): Promise<ServiceResult<ExecutedTrade>> {
    const result = await this.executed.get(asId<"TradeId">(id));
    if (result.status !== "SUCCESS") return result;
    if (result.value === null) return serviceFailure<ExecutedTrade>("NOT_FOUND", `no executed trade with id ${id}`);
    return serviceSuccess(result.value);
  }

  async recordExecutedTrade(trade: ExecutedTrade): Promise<ServiceResult<ExecutedTrade>> {
    const problems = validateExecutedTrade(trade);
    if (problems.length > 0) {
      return serviceFailure<ExecutedTrade>("VALIDATION_ERROR", problems[0], problems.join("; "));
    }
    const put = await this.executed.put(trade, userStamp(this.now));
    if (put.status !== "SUCCESS") return put;
    return serviceSuccess(put.value);
  }

  async createPlannedTrade(trade: PlannedTrade): Promise<ServiceResult<PlannedTrade>> {
    const problems = validatePlannedTrade(trade);
    if (problems.length > 0) {
      return serviceFailure<PlannedTrade>("VALIDATION_ERROR", problems[0], problems.join("; "));
    }
    const put = await this.planned.put(trade, userStamp(this.now));
    if (put.status !== "SUCCESS") return put;
    return serviceSuccess(put.value);
  }

  async getPlannedTrade(id: string): Promise<ServiceResult<PlannedTrade>> {
    const result = await this.planned.get(asId<"PlannedTradeId">(id));
    if (result.status !== "SUCCESS") return result;
    if (result.value === null) return serviceFailure<PlannedTrade>("NOT_FOUND", `no planned trade with id ${id}`);
    return serviceSuccess(result.value);
  }

  async discardPlannedTrade(id: string): Promise<ServiceResult<null>> {
    return this.planned.remove(asId<"PlannedTradeId">(id));
  }

  async listJournalEntries(): Promise<ServiceResult<readonly JournalEntry[]>> {
    const result = await this.journal.list();
    if (result.status !== "SUCCESS") return result;
    return serviceSuccess([...result.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async createJournalEntry(entry: Omit<JournalEntry, "id" | "createdAt">): Promise<ServiceResult<JournalEntry>> {
    const full: JournalEntry = {
      ...entry,
      id: asId<"JournalEntryId">(this.nextId("je")),
      createdAt: this.now(),
    };
    const problems = validateJournalEntry(full);
    if (problems.length > 0) {
      return serviceFailure<JournalEntry>("VALIDATION_ERROR", problems[0], problems.join("; "));
    }
    const put = await this.journal.put(full, userStamp(this.now));
    if (put.status !== "SUCCESS") return put;
    return serviceSuccess(put.value);
  }
}
