import { describe, expect, it } from "vitest";

/**
 * 32D research-isolation guard (domain + service layers).
 *
 * Scans the *source text* of every domain and service module for references
 * to research execution code or frozen evidence paths. Vite's raw-import
 * glob supplies the sources — no filesystem access is used, so this test
 * works in vitest/jsdom and does not trip the repository-wide ban on
 * readFileSync in app source.
 *
 * The narrowest reliable guard: glob by location, no hardcoded application
 * filenames.
 */
const SOURCES: Record<string, string> = import.meta.glob<string>(
  ["./**/*.ts", "../services/**/*.ts"],
  { query: "?raw", import: "default", eager: true },
);

/** Every domain/service module source (excluding this guard file itself). */
const GUARDED_PATHS = Object.keys(SOURCES).filter((p) => !p.includes("isolation32d.test"));

const BANNED_IMPORT_PATTERNS = [
  /phase21_historical_reference/,
  /phase21_reconstruction/,
  /forex_assistant|forex_backtest|trend_backtest/,
  /from\s+["'](?!@\/)[^"']*phase\d+[^"']*["']/,
  /import\s*\(\s*["'](?!@\/)[^"']*phase\d+[^"']*["']\s*\)/,
  /\bexecSync\b|\bspawnSync\b|\bchild_process\b/,
];

const BANNED_FROZEN_PATHS = [
  "eurusd_d.csv",
  "eurusd_daily.csv",
  "phase21_trades.csv",
  "phase21_experiment_results",
  "phase29/results",
  "phase31/results",
  "phase30/results",
];

describe("32D research isolation (domain + services)", () => {
  it("scans the domain and service modules", () => {
    expect(GUARDED_PATHS.length).toBeGreaterThan(15);
  });

  it("no module imports or executes research code", () => {
    for (const path of GUARDED_PATHS) {
      const src = SOURCES[path];
      for (const pattern of BANNED_IMPORT_PATTERNS) {
        expect(src, `${path} matches banned pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("no production module references frozen evidence paths", () => {
    // Scoped to production code: test fixtures may legitimately cite artifact
    // NAMES as provenance metadata (what the Research viewer will display),
    // but no production domain/service code may reference a frozen path.
    const productionPaths = GUARDED_PATHS.filter((p) => !p.includes(".test."));
    expect(productionPaths.length).toBeGreaterThan(10);
    for (const path of productionPaths) {
      const src = SOURCES[path];
      for (const p of BANNED_FROZEN_PATHS) {
        expect(src, `${path} references frozen path ${p}`).not.toContain(p);
      }
    }
  });

  it("domain modules stay free of I/O and framework imports", () => {
    const bannedInDomain = [
      /from\s+["']react["']/,
      /from\s+["']react-dom["']/,
      /\bfetch\s*\(/,
      /localStorage|sessionStorage/,
      /node:fs|node:child_process/,
    ];
    for (const path of GUARDED_PATHS) {
      if (!path.includes("/domain/") || path.includes(".test.")) continue;
      const src = SOURCES[path];
      for (const pattern of bannedInDomain) {
        expect(src, `${path} violates the domain purity rule (${pattern})`).not.toMatch(pattern);
      }
    }
  });
});
