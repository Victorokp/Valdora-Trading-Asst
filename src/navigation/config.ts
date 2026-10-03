import {
  BarChart3,
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  LineChart,
  Settings,
  Shield,
  MoreHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** The eight primary navigation areas (architecture Part 1 §4) — exactly eight. */
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", path: "/", label: "Dashboard", description: "Overview of markets, analysis and risk status", icon: LayoutDashboard },
  { id: "markets", path: "/markets", label: "Markets", description: "Per-pair market state", icon: LineChart },
  { id: "analysis", path: "/analysis", label: "Analysis", description: "Setup analysis and risk calculator", icon: BarChart3 },
  { id: "strategy", path: "/strategy", label: "Strategy", description: "Rules, versions and explainability", icon: FlaskConical },
  { id: "journal", path: "/journal", label: "Journal", description: "Your trade journal", icon: BookOpen },
  { id: "research", path: "/research", label: "Research", description: "Phase 21–31 evidence viewer", icon: FlaskConical },
  { id: "risk", path: "/risk", label: "Risk", description: "Guardrails, exposure, drawdown", icon: Shield },
  { id: "settings", path: "/settings", label: "Settings", description: "Account, appearance, data and AI settings", icon: Settings },
];

/** Mobile pattern: primary five in the bottom bar + "More" sheet (Part 1 §17). */
export const MOBILE_PRIMARY_PATHS: string[] = ["/", "/markets", "/analysis", "/journal", "/risk"];

export const MORE_MENU_ITEM: NavItem = {
  id: "more",
  path: "",
  label: "More",
  description: "Strategy, Research and Settings",
  icon: MoreHorizontal,
};

/** Items reached via the mobile "More" sheet. */
export const MOBILE_MORE_PATHS: string[] = ["/strategy", "/research", "/settings"];
