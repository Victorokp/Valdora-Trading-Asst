/**
 * In-memory repository implementation (32E).
 *
 * A safe local adapter for the current app stage: same interfaces a future
 * cloud adapter will implement, so domain/service code never rewrites. No
 * secrets, no network, no browser storage dependency.
 *
 * Error mapping: attempts to store RESEARCH ownership are rejected as
 * INTEGRITY_ERROR (the persistence layer refuses to become a mutable copy of
 * frozen evidence); other invalid arguments are VALIDATION_ERROR; missing
 * reads are NOT_FOUND.
 */
import { serviceFailure, serviceSuccess, type ServiceResult } from "@/domain/errors";
import type { CollectionRepository, OwnershipStamp, PreferencesRepository } from "@/services/persistence/repository";
import type { UserPreferences } from "@/domain/preferences/preferences";

export class MemoryCollectionRepository<T, ID> implements CollectionRepository<T, ID> {
  private readonly items = new Map<string, { entity: T; stamp: OwnershipStamp }>();

  constructor(
    private readonly idOf: (entity: T) => ID,
    /** Optional structural validation run before accepting a put. */
    private readonly validate?: (entity: T) => readonly string[],
    private readonly onReplace?: (existing: T, incoming: T) => string | null,
  ) {}

  async list(): Promise<ServiceResult<readonly T[]>> {
    const all = [...this.items.values()]
      .sort((a, b) => a.stamp.persistedAt.localeCompare(b.stamp.persistedAt))
      .map((v) => v.entity);
    return serviceSuccess(all);
  }

  async get(id: ID): Promise<ServiceResult<T | null>> {
    const found = this.items.get(String(id));
    if (!found) return serviceSuccess(null);
    return serviceSuccess(found.entity);
  }

  async put(entity: T, stamp: OwnershipStamp): Promise<ServiceResult<T>> {
    if (stamp.ownership === ("RESEARCH" as never)) {
      return serviceFailure<T>("INTEGRITY_ERROR", "research artifacts are immutable and cannot be stored in a user repository");
    }
    if (stamp.ownership !== "USER_DATA" && stamp.ownership !== "MARKET_DATA" && stamp.ownership !== "DERIVED") {
      return serviceFailure<T>("VALIDATION_ERROR", `invalid ownership stamp: ${String(stamp.ownership)}`);
    }
    if (this.validate) {
      const problems = this.validate(entity);
      if (problems.length > 0) {
        return serviceFailure<T>("VALIDATION_ERROR", `${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}`, problems.join("; "));
      }
    }
    const key = String(this.idOf(entity));
    if (this.items.has(key) && this.onReplace) {
      const problem = this.onReplace(this.items.get(key)!.entity, entity);
      if (problem) return serviceFailure<T>("INTEGRITY_ERROR", problem);
    }
    this.items.set(key, { entity, stamp });
    return serviceSuccess(entity);
  }

  async remove(id: ID): Promise<ServiceResult<null>> {
    if (!this.items.has(String(id))) {
      return serviceFailure<null>("NOT_FOUND", `no record with id ${String(id)}`);
    }
    this.items.delete(String(id));
    return serviceSuccess(null);
  }

  /** Test support: current size. */
  get size(): number {
    return this.items.size;
  }
}

/** Preferences: single-document repository with last-write-wins semantics. */
export class MemoryPreferencesRepository implements PreferencesRepository {
  private current: UserPreferences | null = null;

  async load(): Promise<ServiceResult<UserPreferences | null>> {
    return serviceSuccess(this.current);
  }

  async save(prefs: UserPreferences, _stamp: OwnershipStamp): Promise<ServiceResult<UserPreferences>> {
    this.current = prefs;
    return serviceSuccess(prefs);
  }

  async clear(): Promise<ServiceResult<null>> {
    this.current = null;
    return serviceSuccess(null);
  }
}
