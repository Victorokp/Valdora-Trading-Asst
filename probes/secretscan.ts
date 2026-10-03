/**
 * Phase 3 secret-value scan (self-contained, no repo imports).
 *
 * For each configured credential, verifies that its VALUE does not appear in:
 *   (a) git-tracked files of the working tree
 *   (b) the built client bundle (dist/)
 *   (c) any object reachable from any ref in git history
 *
 * Values are read from the process environment and are NEVER printed:
 * only per-key match counts and file/commit locations are reported.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const KEYS = ["TWELVEDATA_API_KEY", "MASSIVE_API_KEY", "ALPHAVANTAGE_API_KEY"];
const ROOT = process.cwd();

function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.stdout ?? "";
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".venv" || name === "__pycache__") continue;
    const p = join(dir, name);
    try {
      if (statSync(p).isDirectory()) walkFiles(p, out);
      else out.push(p);
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

function countIn(path: string, needle: string): number {
  try {
    const buf = require("node:fs").readFileSync(path);
    let count = 0;
    let idx = buf.indexOf(needle);
    while (idx !== -1) {
      count += 1;
      idx = buf.indexOf(needle, idx + 1);
    }
    return count;
  } catch {
    return 0;
  }
}

const tracked = git(["ls-files"]).split("\n").filter(Boolean);
const distFiles = (() => {
  try {
    return walkFiles(join(ROOT, "dist"));
  } catch {
    return [] as string[];
  }
})();
const revs = git(["rev-list", "--all"]).split("\n").filter(Boolean);

let clean = true;
for (const key of KEYS) {
  const val = process.env[key];
  if (!val || val.trim().length < 8) {
    console.log(`${key}: NOT_SET_IN_ENV (nothing to scan)`);
    continue;
  }
  const hits: string[] = [];
  for (const f of tracked) {
    const n = countIn(join(ROOT, f), val);
    if (n > 0) hits.push(`tracked:${f} (x${n})`);
  }
  for (const f of distFiles) {
    const n = countIn(f, val);
    if (n > 0) hits.push(`dist:${f} (x${n})`);
  }
  const grep = spawnSync("git", ["grep", "-l", "-F", val, "--", ...revs], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const histOut = (grep.stdout ?? "").trim();
  if (histOut) hits.push(...histOut.split("\n").map((l) => `history:${l}`));
  if (hits.length > 0) {
    clean = false;
    console.log(`${key}: LEAKED -> ${hits.join(" | ")}`);
  } else {
    console.log(`${key}: CLEAN (tracked=${tracked.length}, dist=${distFiles.length}, revs=${revs.length})`);
  }
}
console.log(clean ? "RESULT: NO_VALUE_LEAKS" : "RESULT: LEAKS_FOUND");
process.exit(clean ? 0 : 1);
