/**
 * NotificationService implementation (32R).
 *
 * In-app notification center over the notification repository. No delivery
 * channels exist — nothing is emailed, pushed or sent anywhere. Notifications
 * are records the app (or the user's own actions) create, rendered newest
 * first, with an unread count for the bell badge.
 */
import { asId, type NotificationId } from "@/domain/ids";
import { serviceFailure, serviceSuccess, type ServiceResult } from "@/domain/errors";
import type { Notification } from "@/domain/notifications/notification";
import type { NotificationRepository, OwnershipStamp } from "@/services/persistence/repository";
import { MemoryCollectionRepository } from "@/services/persistence/memory";
import type { NotificationService } from "@/services/index";

export class NotificationServiceImpl implements NotificationService {
  private seq = 0;

  constructor(
    private readonly repo: NotificationRepository,
    private readonly stamp: (persistedAt: string) => OwnershipStamp,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listUnread(): Promise<ServiceResult<readonly Notification[]>> {
    const result = await this.repo.listUnread();
    if (result.status !== "SUCCESS") return result;
    return serviceSuccess([...result.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async listAll(): Promise<ServiceResult<readonly Notification[]>> {
    const result = await this.repo.list();
    if (result.status !== "SUCCESS") return result;
    return serviceSuccess([...result.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async unreadCount(): Promise<ServiceResult<number>> {
    const result = await this.repo.listUnread();
    if (result.status !== "SUCCESS") return result;
    return serviceSuccess(result.value.length);
  }

  async markRead(id: string): Promise<ServiceResult<Notification>> {
    const existing = await this.repo.get(asId<"NotificationId">(id));
    if (existing.status !== "SUCCESS") return existing;
    if (existing.value === null) return serviceFailure<Notification>("NOT_FOUND", `no notification with id ${id}`);
    if (existing.value.read) return serviceSuccess(existing.value);
    const updated: Notification = { ...existing.value, read: true };
    const put = await this.repo.put(updated, this.stamp(this.now()));
    if (put.status !== "SUCCESS") return put;
    return serviceSuccess(put.value);
  }

  async markAllRead(): Promise<ServiceResult<number>> {
    const unread = await this.listUnread();
    if (unread.status !== "SUCCESS") return unread;
    let count = 0;
    for (const n of unread.value) {
      const updated: Notification = { ...n, read: true };
      const put = await this.repo.put(updated, this.stamp(this.now()));
      if (put.status === "SUCCESS") count += 1;
    }
    return serviceSuccess(count);
  }

  async create(input: {
    type: Notification["type"];
    severity: Notification["severity"];
    title: string;
    message: string;
    relatedEntity?: Notification["relatedEntity"];
  }): Promise<ServiceResult<Notification>> {
    this.seq += 1;
    const notification: Notification = {
      id: asId<"NotificationId">(`ntf-${this.seq}-${this.now()}`),
      type: input.type,
      severity: input.severity,
      createdAt: this.now(),
      title: input.title,
      message: input.message,
      relatedEntity: input.relatedEntity,
      read: false,
    };
    const put = await this.repo.put(notification, this.stamp(this.now()));
    if (put.status !== "SUCCESS") return put;
    return serviceSuccess(put.value);
  }
}

/** In-memory NotificationRepository base (listUnread/markRead over the collection). */
export class MemoryNotificationRepository
  extends MemoryCollectionRepository<Notification, NotificationId>
  implements NotificationRepository
{
  constructor(stamp?: OwnershipStamp) {
    super(
      (n) => asId<"NotificationId">(n.id),
      undefined,
      stamp
        ? (existing, incoming) => (existing.id !== incoming.id ? "cannot replace a different notification" : null)
        : undefined,
    );
    void stamp;
  }

  async listUnread(): Promise<ServiceResult<readonly Notification[]>> {
    const all = await this.list();
    if (all.status !== "SUCCESS") return all;
    return serviceSuccess(all.value.filter((n) => !n.read));
  }

  async markRead(id: NotificationId): Promise<ServiceResult<Notification>> {
    const found = await this.get(id);
    if (found.status !== "SUCCESS") return found;
    if (found.value === null) return serviceFailure<Notification>("NOT_FOUND", `no notification with id ${String(id)}`);
    const updated: Notification = { ...found.value, read: true };
    return this.put(updated, { ownership: "USER_DATA", persistedAt: new Date().toISOString() });
  }
}
