import { useEffect, useState } from "react";
import { Bell, UserRound } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import { AskValdora } from "@/components/assistant/AskValdora";
import { Logo } from "@/components/brand/Logo";
import { MarketStatusIndicator } from "@/components/market/MarketStatusIndicator";
import { NAV_ITEMS } from "@/navigation/config";
import { useAppServices } from "@/services/app";
import { cn } from "@/lib/cn";

/**
 * Desktop/tablet top bar. Mobile uses BottomNav + a condensed TopBar
 * (the full desktop link row is hidden on small screens). The bell shows the
 * live unread count from the in-app notification service — no delivery
 * channel exists, so the bell links to the in-app center only.
 */
export function TopBar() {
  const { notifications } = useAppServices();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const result = await notifications.unreadCount();
      if (!cancelled && result.status === "SUCCESS") setUnread(result.value);
    }
    void poll();
    const timer = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [notifications]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-nav/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-3 sm:px-4">
        <Link to="/" className="flex items-center rounded-control" aria-label="VALDORA home">
          <Logo compact markSize={22} />
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden min-w-0 flex-1 lg:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex min-h-9 items-center rounded-control px-3 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-accent-dim/70 text-accent-strong"
                        : "text-muted hover:bg-surface hover:text-ink",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:block">
            <MarketStatusIndicator status="UNKNOWN" />
          </div>
          <div className="hidden sm:block">
            <AskValdora />
          </div>
          <Link
            to="/notifications"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            className="relative inline-flex min-h-9 min-w-9 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-ink"
          >
            <Bell aria-hidden="true" className="size-4" />
            {unread > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-pill bg-negative px-1 py-px text-[9px] font-bold leading-none text-white"
              >
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>
          <Link
            to="/settings"
            aria-label="Account and settings"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-ink"
          >
            <UserRound aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
