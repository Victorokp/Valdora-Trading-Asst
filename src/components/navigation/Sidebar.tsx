import { NavLink } from "react-router-dom";

import { LogoMark } from "@/components/brand/Logo";
import { NAV_ITEMS } from "@/navigation/config";
import { cn } from "@/lib/cn";

/** Desktop navigation sidebar (all eight areas). */
export function Sidebar() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-line bg-nav lg:block">
      <nav aria-label="Sections" className="flex h-full flex-col p-3">
        <ul className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-start gap-3 rounded-control px-3 py-2.5 transition-colors",
                    isActive ? "bg-accent-dim/70 text-accent-strong" : "text-muted hover:bg-surface hover:text-ink",
                  )
                }
              >
                <item.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-[11px] leading-snug text-faint">{item.description}</span>
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t border-line px-3 pt-3 pb-1">
          <LogoMark size={16} monochrome className="text-faint" />
          <span className="text-[10px] uppercase tracking-wider text-faint">
            Evidence-first decision support
          </span>
        </div>
      </nav>
    </aside>
  );
}
