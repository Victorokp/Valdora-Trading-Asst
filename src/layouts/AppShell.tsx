import { Outlet } from "react-router-dom";

import { BottomNav } from "@/components/navigation/BottomNav";
import { Sidebar } from "@/components/navigation/Sidebar";
import { TopBar } from "@/components/navigation/TopBar";

/**
 * Application shell: TopBar (identity + context area) · Sidebar (desktop) ·
 * routed content · BottomNav (mobile primary 5 + More). Single nav system —
 * the Dashboard never duplicates navigation.
 */
export function AppShell() {
  return (
    <div className="min-h-dvh bg-page">
      <TopBar />
      <div className="mx-auto flex w-full max-w-6xl">
        <Sidebar />
        <main
          id="main-content"
          className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-4 lg:pb-10"
          aria-label="Main content"
        >
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
