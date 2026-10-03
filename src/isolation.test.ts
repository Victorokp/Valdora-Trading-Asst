import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Research-isolation guard (32C test requirement): the application must never
 * import or execute frozen research code. All app source lives under src/
 * and must not reference research modules, paths or scripts.
 *
 * This guard file itself is excluded from the scan because it necessarily
 * contains the banned literals it checks for.
 */
const SRC_ROOT = join(process.cwd(), "src");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const APP_FILES = listFiles(SRC_ROOT).filter(
  (f) => !/isolation[a-z0-9]*\.test\.tsx?$/.test(f),
);

describe("research boundary integrity", () => {
  it("app source exists and is scanned", () => {
    expect(APP_FILES.length).toBeGreaterThan(20);
  });

  it("no app source imports or executes research modules", () => {
    const banned = [
      /from\s+["'](?!@\/)[^"']*(phase21_historical_reference|phase21_reconciliation_experiment|forex_assistant|forex_backtest|trend_backtest|main\.py|phase21_reconstruction)["']/,
      /import\s*\(\s*["'](?!@\/)[^"']*phase\d+[^"']*["']\s*\)/,
      /require\s*\(\s*["'](?!@\/)[^"']*phase\d+[^"']*["']\s*\)/,
      /from\s+["'](?!@\/)[^"']*phase\d+[^"']*["']/,
      /readFileSync|execSync|spawnSync/,
    ];
    for (const file of APP_FILES) {
      const content = readFileSync(file, "utf8");
      for (const pattern of banned) {
        expect(content, `${file} matches banned pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("app source never imports legacy engine modules (canonical map §Legacy)", () => {
    // VALDORA_REPOSITORY_MAP.md designates the canonical Phase-21 engine and
    // classifies every competing trading script as legacy/research. The app
    // consumes research definitions ONLY through the ResearchService registry,
    // so no legacy module name may appear as an import target.
    const legacyModules = [
      "phase21_reconstruction",
      "phase21_historical_reference",
      "phase21_reconciliation_experiment",
      "forex_assistant",
      "forex_backtest",
      "trend_backtest",
    ];
    for (const file of APP_FILES) {
      const content = readFileSync(file, "utf8");
      for (const module of legacyModules) {
        const importPattern = new RegExp(
          `(from\\s+["']|import\\(\\s*["']|require\\(\\s*["'])[^"']*${module}`,
        );
        expect(content, `${file} imports legacy module ${module}`).not.toMatch(importPattern);
      }
    }
  });

  it("app source never references the frozen evidence tree", () => {
    const bannedPaths = [
      "eurusd_d.csv",
      "eurusd_daily.csv",
      "phase21_trades.csv",
      "phase29/results",
      "phase31/results",
      "phase21_experiment_results",
    ];
    for (const file of APP_FILES) {
      const content = readFileSync(file, "utf8");
      for (const p of bannedPaths) {
        expect(content, `${file} references frozen path ${p}`).not.toContain(p);
      }
    }
  });
});
