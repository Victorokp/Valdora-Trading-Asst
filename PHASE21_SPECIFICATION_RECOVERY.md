# Phase-21 Specification Recovery Report

Status: **SEARCH COMPLETE — NO NEW AUTHORITATIVE DEFINITIONS RECOVERED.**

This report documents a specification-recovery pass only. No strategy parameter,
rule, filter, friction, ATR, stop/target, entry timing, or exit handling was
modified. No optimization, tuning, benchmark fitting, tolerance gate, Phase-26,
or Phase-27 work was performed.

## 0. Execution environment and git-state disclosure

- Searched at commit `e07cd56` — "Execute Phase-21 frozen reconstruction and
  forensic audit" (the authoritative Phase-21 checkpoint).
- Disclosure: the workspace clone was shallow and initially checked out at
  `07519ee` ("Add files via upload", 4 FX CSV uploads). The full history was
  recovered with `git fetch --unshallow` and the clean tree was fast-forwarded
  (`git merge --ff-only origin/main`) to `e07cd56`. No reset, rebase, force
  push, or history rewrite was used; `07519ee` is an ancestor of `e07cd56` on
  the same branch.
- Repository: `Victorokp/Valdora-Trading-Asst`, branch `main`.
- Search performed on 2026-09-26.

## 1. Search methodology (Step 1–3 coverage)

Searches performed against the current tree at `e07cd56` **and** against every
commit in history (`d02b9a4`, `7aeaa8a`, `f6fcb63`, `bda2bc4`, `7a1c057`,
`07519ee`, `e07cd56`), case-insensitive:

- `V1` `V2` `V3` `V4` `V5` `V6` `V7` `V8` `V9` `V10` `V11` `V12` `V13`
- `walk-forward` / `walkforward` / `walk_forward`
- `Phase 22` `Phase 23` `Phase 24` `Phase 25` `Phase 26` `Phase 27`
  (`phase22`/`phase26`/`phase27`)
- `ADX` `ADX14`
- `drawdown` `max drawdown` `max_drawdown`
- `70/15/15`
- `train` `validation` `holdout`
- `benchmark` `forensic` `reconstruction` `split` `equity`

Additional channels inspected:

- Every commit message (`git log --all`): six commits, all listed in §2.
- The remote branch `phase-21-reconstruction` (fetched separately): its diff
  against `main` is **empty** — identical tree (already merged via PR #1).
- Deleted files: `git log --all --diff-filter=D` — **no file was ever deleted**
  in this repository's history; nothing is recoverable only from deletion.
- Dangling/unreachable objects: `git fsck --lost-found` — none.
- GitHub Issues: exactly one, closed (PR #1 "Implement Phase-21 frozen core and
  tests", body empty, **no comments**).
- GitHub Wiki: `has_wiki: true`, but the wiki repository does not exist
  (`…​.wiki.git` → "Repository not found"); no wiki content.
- GitHub Pages: not configured (API 404).
- `README.md` history: single line `# Valdora-Trading-Asst`, never changed
  since the initial commit.

### Where the keywords actually occur

| Keyword | Commits containing it | Files |
|---|---|---|
| `V1` | f6fcb63 onward | `forex_assistant.py` (×2), `forex_backtest.py` (×2), `results/forex_summary.txt`, Phase-21 unresolved/report files |
| `V13` | bda2bc4 onward | `PHASE21_UNRESOLVED.md` (marker only: "definitions were not supplied") |
| `V2`–`V12` | **none** | — (never appear in any commit) |
| `walk-forward` / `walk_forward` / `walkforward` | bda2bc4 onward | `PHASE21_UNRESOLVED.md` (marker only) |
| `Phase 26` / `Phase 27` | bda2bc4 onward | `PHASE21_UNRESOLVED.md` ("Explicitly out of scope" only; no content anywhere) |
| `ADX` / `ADX14` | bda2bc4 onward | `PHASE21_UNRESOLVED.md`, `phase21_reconstruction.py` (NaN column), reports (all as "unspecified/not implemented") |
| `70/15/15` | bda2bc4 onward | `PHASE21_UNRESOLVED.md` (marker only) |
| `train` | bda2bc4 onward | `PHASE21_UNRESOLVED.md` (date-structure line only) |
| `drawdown` / `max_drawdown` | f6fcb63 onward | legacy scanners (`forex_backtest.py`, `main.py`, `trend_backtest.py`), Phase-21 files (as "pending/unresolved") |
| `70/30`, `development_70pct`, `holdout_30pct` | f6fcb63 onward | legacy scanners only — a **different** split scheme from the unresolved 70/15/15 |

## 2. Executive status (Step 4 classification)

| Item | Status | Classification detail |
|---|---|---|
| 1. 16-window walk-forward execution semantics | **UNKNOWN** | Only the date structure is authoritative. Every operational question is explicitly listed as unspecified in the Phase-21 artifacts themselves. |
| 2. V1–V13 definitions | **UNKNOWN** | V2–V12 appear in **no commit**. V1 appears only as a product name / gate comment, not as a numbered version definition. V13 appears only as an explicit "not supplied" marker. |
| 3. ADX14 convention | **PARTIALLY RESOLVED** | Role recovered (information-only — authoritative). Computation (±DM, TR, smoothing, seed, alignment, NaN policy, threshold) — UNKNOWN. |
| 4. Equity / max-drawdown convention | **PARTIALLY RESOLVED** | Authoritative negative finding: Phase 21 has **no** equity/drawdown convention by design ("pending"); implementing one now is prohibited. A different, self-documented convention exists in the legacy EUR/USD scanner — precedent evidence only, **not** authoritative for Phase 21. |
| 5. 70/15/15 split boundary rules | **UNKNOWN** | Only "calendar-time splitting is known" plus explicit "cutoff rounding and inclusivity not specified". Legacy repo code uses 70/30 row-based splits (a different scheme). |

No item reached **RESOLVED — AUTHORITATIVE (implementable)** except the narrow
role statements quoted in §3.

## 3. Evidence table

| Item | Status | Source | Commit / file / lines | Evidence |
|---|---|---|---|---|
| Walk-forward date structure | AUTHORITATIVE | Phase-21 unresolved file | `e07cd56` `PHASE21_UNRESOLVED.md` lines 8–14 | "The dates are known: T=2010 through T=2025, with train T-6 through T-2, validation T-1, and test T." |
| Walk-forward execution semantics | UNKNOWN (explicitly unresolved) | Phase-21 unresolved file | `e07cd56` `PHASE21_UNRESOLVED.md` lines 11–14 | "It is not yet defined whether the three phases are replayed continuously or independently, whether train is context-only, how capital and positions reset, or how trades crossing boundaries are assigned." + "No walk-forward result is claimed by this stage." |
| V1–V13 | UNKNOWN | Phase-21 unresolved file | `e07cd56` `PHASE21_UNRESOLVED.md` lines 16–19 | "The names, formulas, expected values, and roles of V1-V13 were not supplied in the active specification. No V1-V13 values are invented or inferred." |
| ADX14 role | AUTHORITATIVE | Phase-21 unresolved file | `e07cd56` `PHASE21_UNRESOLVED.md` lines 21–25 | "ADX is information-only, but the exact directional-movement, smoothing, seed, and alignment convention was not supplied. The trade ledger contains an `ADX14` column filled with `NaN`. No ADX implementation is executed." |
| Phase-21 equity/drawdown | PARTIAL (authoritative pending state) | Phase-21 unresolved file + engine + reports | `e07cd56` `PHASE21_UNRESOLVED.md` lines 27–30; `phase21_reconstruction.py` module docstring lines 14–17; `phase21_results/PHASE21_FULL_FORENSIC_REPORT.md` ("Maximum drawdown: PENDING_UNRESOLVED_EQUITY_CONVENTION") | "No convention was supplied for closed-trade R equity versus mark-to-market equity, daily sampling, initial capital, sign, or treatment of open trades. Maximum drawdown is reported as pending." |
| 70/15/15 split | UNKNOWN (explicitly unresolved) | Phase-21 unresolved file | `e07cd56` `PHASE21_UNRESOLVED.md` lines 32–35 | "Calendar-time splitting is known, but cutoff rounding and inclusivity are not specified. No split membership or split statistics are emitted." |
| "V1" product name + gate | AUTHORITATIVE (naming only) | legacy scanner | `f6fcb63` `forex_assistant.py` lines 25–30; `forex_backtest.py` line 2 | "V1 volatility gate: ATR must be between 0.10% and 1.50% of closing price. These are explicit fixed thresholds, not optimized from the downloaded data." / "Fixed-rule EUR/USD daily backtest for Forex Trading Assistant V1." |
| Legacy MTM equity/drawdown (precedent only) | NOT AUTHORITATIVE for Phase 21 | legacy scanner | `f6fcb63` `forex_backtest.py` ~lines 273–345 (`close_equity = balance; if position is not None: close_equity += position.direction * position.units_eur * (row["Close"] - position.entry_price)`; running-peak normalized drawdown, max over daily samples) and `results/forex_summary.txt`: "Maximum drawdown is measured from daily close-to-close equity, including unrealized P&L." | A self-documented convention exists for the legacy EUR/USD scanner, but no artifact ties it to Phase 21. |
| Legacy 70/30 row split (precedent only) | NOT AUTHORITATIVE for Phase 21 | legacy scanner | `f6fcb63` `forex_backtest.py` ~line 590: `split_at = int(row_count * 0.70)` (+ `np.array_split` thirds); `main.py` / `trend_backtest.py` SPY 70/30 with `int(count * 0.70)` | Row-count-based 70/30, floor-style truncation, first-window-inclusive. Different scheme from the unresolved calendar-time 70/15/15. |

## 4. Recovered definitions (exact text — Step 6/7/8/9 answers)

### 4.1 16-window walk-forward (Step 5)

AUTHORITATIVE (structure only), quoted verbatim from `PHASE21_UNRESOLVED.md`
(both `bda2bc4` lines 51–61 and `e07cd56` lines 8–14 carry the same statement;
the `e07cd56` version is quoted):

> 1. **16-window walk-forward execution**
>    - The dates are known: T=2010 through T=2025, with train T-6 through T-2,
>      validation T-1, and test T.
>    - It is not yet defined whether the three phases are replayed continuously
>      or independently, whether train is context-only, how capital and
>      positions reset, or how trades crossing boundaries are assigned.
>    - No walk-forward result is claimed by this stage.

Answers to the Step-5 question list, all **UNKNOWN**:

- Are windows independent? — Unknown.
- Does each window reset position state? — Unknown.
- Can a trade cross a train/validation/test boundary? — Unknown.
- Is the engine run continuously or separately per window? — Unknown.
- Does training actually influence parameters? — Unknown. (Corollary: the
  frozen rule set contains no parameters that a documented search produced; no
  training mechanism exists in any artifact.)
- Are parameters frozen? — Unknown as a walk-forward rule; the frozen
  reconstruction treats all rule values as fixed, but that is the Phase-21
  implementation stance, not a recovered walk-forward definition.
- Does validation affect anything? — Unknown.
- Does test begin flat? — Unknown.
- How are trades crossing boundaries handled? — Unknown.
- Are exit dates clipped? — Unknown.
- Is state inherited between windows? — Unknown.

### 4.2 V1–V13 (Step 6)

Recovery table (no entries invented):

| Version | Exact definition | Parameters | Formula/rules | Role | Evidence |
|---|---|---|---|---|---|
| V1 | "Forex Trading Assistant V1" — product name; the only numbered rule text recovered is the volatility gate below. | MIN_ATR_PCT = 0.10, MAX_ATR_PCT = 1.50 (% of Close) | "ATR must be between 0.10% and 1.50% of closing price" | Signal gate (already part of the frozen Phase-21 signal conditions) | `forex_assistant.py:25–30` (`f6fcb63`), also `results/forex_summary.txt` |
| V2–V12 | — | — | — | — | **No occurrence in any commit. UNKNOWN.** |
| V13 | — | — | — | — | Named only in `PHASE21_UNRESOLVED.md` as part of the set whose "names, formulas, expected values, and roles … were not supplied". UNKNOWN. |

Verbatim marker (`e07cd56` `PHASE21_UNRESOLVED.md` lines 16–19):

> 2. **V1-V13 reconciliation**
>    - The names, formulas, expected values, and roles of V1-V13 were not
>      supplied in the active specification.
>    - No V1-V13 values are invented or inferred.

No conflicting definitions exist; there is only the absence of definitions.

### 4.3 ADX14 (Step 7)

AUTHORITATIVE (role only), quoted verbatim from `e07cd56`
`PHASE21_UNRESOLVED.md` lines 21–25:

> 3. **ADX14**
>    - ADX is information-only, but the exact directional-movement, smoothing,
>      seed, and alignment convention was not supplied.
>    - The trade ledger contains an `ADX14` column filled with `NaN`.
>    - No ADX implementation is executed.

Step-7 answers: ±DM convention — UNKNOWN; true-range definition — UNKNOWN for
ADX (the frozen ATR14 true range exists but is a different indicator); smoothing
method — UNKNOWN; initialization/seed — UNKNOWN; period — 14 by name only
(AUTHORITATIVE as a label); alignment — UNKNOWN; NaN handling — AUTHORITATIVE
by implementation (ledger column is explicit `NaN`); informational vs filter —
AUTHORITATIVE: information-only, **not** a signal filter; threshold/filter —
NONE recovered.

### 4.4 Equity / maximum drawdown (Step 8)

AUTHORITATIVE (pending state), quoted verbatim from `e07cd56`
`PHASE21_UNRESOLVED.md` lines 27–30:

> 4. **Drawdown and equity**
>    - No convention was supplied for closed-trade R equity versus mark-to-market
>      equity, daily sampling, initial capital, sign, or treatment of open trades.
>    - Maximum drawdown is reported as pending.

The engine's own docstring (`phase21_reconstruction.py`, lines 14–17, same
commit) states: "It does not implement ADX, V1-V13 reconciliation, walk-forward
execution, drawdown/equity conventions, or split-boundary assignment."

Step-8 answers: closed-trade-R vs mark-to-market — Unknown for Phase 21; each
trade adds R directly — Unknown; unrealized positions count — Unknown; sampling
frequency — Unknown; starting equity — Unknown; peak definition — Unknown;
sign convention — Unknown; open-at-end treatment — Unknown.

Per the Step-8 instruction, the historical benchmark value "max DD -12R"
(EURUSD) is treated as forensic comparison evidence only and does **not**
define the methodology.

**Precedent evidence only (NOT authoritative, NOT to be implemented for
Phase 21):** the legacy EUR/USD V1 scanner (`forex_backtest.py`, `f6fcb63`)
self-documents a convention: daily close-to-close mark-to-market equity
(`close_equity = balance`, plus open-position directional P&L vs entry),
running-peak normalized drawdown, reported as a positive percentage, with the
open position liquidated at period end (`"period_end_close"`), and summarized
in `results/forex_summary.txt` as "Maximum drawdown is measured from daily
close-to-close equity, including unrealized P&L." The Phase-21 artifacts never
reference this convention, and the Phase-21 data source differs (authoritative
`eurusd_d.csv` vs legacy `eurusd_daily.csv`), so no artifact links it to the
Phase-21 benchmark.

### 4.5 70/15/15 split (Step 9)

AUTHORITATIVE (partial), quoted verbatim from `e07cd56`
`PHASE21_UNRESOLVED.md` lines 32–35:

> 5. **70/15/15 split assignment**
>    - Calendar-time splitting is known, but cutoff rounding and inclusivity are
>      not specified.
>    - No split membership or split statistics are emitted.

Step-9 answers: rows vs dates vs years — calendar-time (AUTHORITATIVE as a
category); exact 70/15/15 calculation — Unknown; floor/ceil/round — Unknown;
inclusive/exclusive boundaries — Unknown; equal timestamps — Unknown; applied
before/after indicator warmup — Unknown; trades/signals crossing boundaries —
Unknown.

**Precedent evidence only (different scheme):** the legacy scanners split by
row count, not calendar: `forex_backtest.py` (`f6fcb63`, ~line 590)
`split_at = int(row_count * 0.70)` producing `full_history` /
`development_70pct` / `holdout_30pct` windows, plus `np.array_split` thirds;
`main.py` and `trend_backtest.py` use `int(count * 0.70)` for the SPY 70/30
split. No artifact connects these to the Phase-21 70/15/15 item.

## 5. Conflicts (Step 4/13.4)

No conflicting authoritative definitions of any Phase-21 item were found — the
predominant finding is **absence** of definitions. Two non-conflicts worth
recording:

1. **Legacy 70/30 (row-based) vs Phase-21 70/15/15 (calendar-time).** These are
   different instruments: the legacy split belongs to the older scanner runs
   (`results/forex_summary.txt`, `summary.txt`, `trend_summary.txt`); the
   70/15/15 item belongs to the Phase-21 specification and is explicitly
   unresolved. They are not competing definitions of one thing.
2. **`open_at_end` vs `dataset_end_close`.** Already adjudicated in
   `phase21_results/PHASE21_FULL_FORENSIC_REPORT.md` as an output-label /
   state-encoding difference only, deliberately not changed. No action.

## 6. Remaining unknowns (Step 13.5)

Everything listed in §4.1, §4.2 (V2–V12 entirely; V13 as a definition; V1's
numbered-series identity beyond the product name), §4.3 (ADX computation), §4.4
(Phase-21 equity/drawdown convention), and §4.5 (split arithmetic) remains
unknown. Additionally:

- **Benchmark provenance**: no committed artifact shows how the historical
  Phase-21 benchmarks (EURUSD 115/1.49/+32.26R etc.) were produced — which
  engine, data snapshot, or conventions. The full forensic report already
  documents the candidate contributing factors (different data provider/window,
  unknown EMA/ATR library and seeds). The 115-vs-141 trade and PF differences
  are therefore not attributable to any recovered specification.
- **Phase 26 / Phase 27**: named only as out of scope in
  `PHASE21_UNRESOLVED.md` lines 41–42; no content exists anywhere in the
  repository or its history.
- **Original Phase-21 specification document**: the authoritative source that
  supplied the frozen rule set, the walk-forward date structure, and the
  benchmarks is not in this repository; it was evidently supplied out-of-band
  during Phase-21 construction.

## 7. Recommended next implementation step (Step 13.6)

**None of the five items can be implemented from evidence inside this
repository.** The only defensible next step is external:

1. Obtain the original authoritative Phase-21 specification (the same
   out-of-band source that supplied the frozen rule set, the walk-forward date
   structure, and the benchmark tables). On receipt, transcribe the definitions
   verbatim into a committed specification file before any implementation.
2. Until then, the frozen reconstruction remains correct as-is: ADX14 stays an
   explicit `NaN` column, maximum drawdown stays
   `PENDING_UNRESOLVED_EQUITY_CONVENTION`, no walk-forward execution, no split
   membership, and no V-series artifacts are emitted.

Per the Step-14 rule, no regression test was added: no authoritative
specification was discovered that contradicts the current implementation, so
there is nothing new to pin down. The existing suite is untouched and passes.

## 8. Search-completeness statement

We searched the repository and its full history thoroughly (current tree, all
six commits, all keyword variants, remote branch, deleted files, dangling
objects, commit messages, PR and issues, wiki, Pages, README history).
Authoritative definitions for **walk-forward execution semantics**, **V1–V13**,
**the ADX14 computation convention**, **the Phase-21 equity/max-drawdown
convention**, and **the 70/15/15 split arithmetic** were **not found**. The
recovered authoritative fragments are limited to: the walk-forward date
structure, the ADX14 information-only role, the split's calendar-time category,
and the explicit "not supplied / pending" statements themselves.
