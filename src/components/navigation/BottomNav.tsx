import { useState } from "react";
import { NavLink } from "react-router-dom";

import { MOBILE_MORE_PATHS, MOBILE_PRIMARY_PATHS, MORE_MENU_ITEM, NAV_ITEMS } from "@/navigation/config";
import { cn } from "@/lib/cn";

/**
 * Mobile bottom navigation: primary five items + a "More" sheet holding the
 * remaining three (Part 1 §17). 44px+ touch targets throughout.
 */
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = MOBILE_PRIMARY_PATHS.map((p) => NAV_ITEMS.find((i) => i.path === p)!).filter(Boolean);
  const moreItems = MOBILE_MORE_PATHS.map((p) => NAV_ITEMS.find((i) => i.path === p)!).filter(Boolean);

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMoreOpen(false)} aria-hidden="true" />
      ) : null}

      {moreOpen ? (
        <div
          role="dialog"
          aria-label="More navigation"
          className="fixed inset-x-2 bottom-[4.5rem] z-50 rounded-card border border-line bg-modal p-2 shadow-2xl shadow-black/50 lg:hidden"
        >
          <ul className="space-y-1">
            {moreItems.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-12 items-center gap-3 rounded-control px-3 text-sm font-medium",
                      isActive ? "bg-accent-dim/70 text-accent-strong" : "text-ink-secondary hover:bg-surface",
                    )
                  }
                >
                  <item.icon aria-hidden="true" className="size-4" />
                  <span className="min-w-0">
                    <span className="block">{item.label}</span>
                    <span className="block text-[11px] leading-snug text-faint">{item.description}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-nav/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-6">
          {primary.map((item) => (
            <li key={item.id} className="grid">
              <NavLink
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors",
                    isActive ? "text-accent-strong" : "text-muted hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon aria-hidden="true" className={cn("size-5", isActive && "text-accent-strong")} />
                    <span className="max-w-full truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li className="grid">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors",
                moreOpen ? "text-accent-strong" : "text-muted hover:text-ink",
              )}
            >
              <MORE_MENU_ITEM.icon aria-hidden="true" className={cn("size-5", moreOpen && "text-accent-strong")} />
              <span>{MORE_MENU_ITEM.label}</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
