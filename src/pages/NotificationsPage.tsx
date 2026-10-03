import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * Notification center route (32R). In-app records only; no channel delivers
 * anything. Reached from the TopBar bell.
 */
export default function NotificationsPage() {
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Notifications"
        title="Notifications"
        description="In-app records of setup-state changes, risk-limit events and research updates. Nothing is delivered externally."
      />
      <div className="mx-auto max-w-2xl">
        <NotificationCenter />
      </div>
    </div>
  );
}
