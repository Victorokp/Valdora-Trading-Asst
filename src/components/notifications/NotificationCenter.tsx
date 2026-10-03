/**
 * Notification center (32R) — in-app only, no delivery.
 *
 * Renders the user's notifications newest-first with an unread count and a
 * mark-all-read action. The empty state is honest: no notifications exist
 * until the app records one. Severity uses the neutral vocabulary
 * (INFO/CAUTION/CRITICAL); wording never implies certainty or urgency to act.
 */
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, CheckCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/feedback";
import { useAppServices } from "@/services/app";
import type { Notification } from "@/domain/notifications/notification";
import { formatTimestamp } from "@/lib/formatters";

const SEVERITY_VARIANT = {
  INFO: "outline",
  CAUTION: "caution",
  CRITICAL: "negative",
} as const;

export function NotificationCenter() {
  const { notifications } = useAppServices();
  const [items, setItems] = useState<readonly Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const result = await notifications.listAll();
    if (result.status === "SUCCESS") setItems(result.value);
    setLoaded(true);
  }, [notifications]);

  useEffect(() => {
    void refresh();
    // The service is an in-memory collection (no network): a light poll keeps
    // the center current with records created elsewhere in the app.
    const timer = window.setInterval(() => void refresh(), 500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const unread = items.filter((n) => !n.read).length;

  async function markAll() {
    await notifications.markAllRead();
    await refresh();
  }

  return (
    <Card aria-label="Notification center">
      <CardHeader
        title="Notifications"
        description="In-app records only — nothing is sent anywhere"
        actions={
          <>
            {unread > 0 ? <Badge variant="accent">{unread} unread</Badge> : null}
            <Button variant="ghost" size="sm" onClick={() => void markAll()} disabled={unread === 0}>
              <CheckCheck aria-hidden="true" className="size-3.5" />
              Mark all read
            </Button>
          </>
        }
      />
      <CardBody>
        {!loaded ? (
          <p className="text-xs text-muted">Loading notifications…</p>
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={BellOff}
            title="No notifications"
            hint="The app records a notification when a setup state changes or a risk limit is reached. Nothing is fabricated to fill this space."
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Bell
                  aria-hidden="true"
                  className={n.read ? "mt-0.5 size-4 shrink-0 text-faint" : "mt-0.5 size-4 shrink-0 text-accent"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={n.read ? "text-sm text-muted" : "text-sm font-medium text-ink"}>{n.title}</span>
                    <Badge variant={SEVERITY_VARIANT[n.severity]}>{n.severity}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{n.message}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-faint">
                    {formatTimestamp(n.createdAt)} · {n.type.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
