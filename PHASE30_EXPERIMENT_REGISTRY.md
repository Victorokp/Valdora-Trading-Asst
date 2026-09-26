# PHASE30_EXPERIMENT_REGISTRY.md

Pre-registration: **every experiment below is frozen BEFORE execution.**
No Phase-30 experiment has been run. No external dataset has been
obtained. Values, seeds, metrics, and failure criteria may not be changed
after results are seen; a failed experiment is reported as failed.
Classification (Robustness / External validation / Implementation
validation / Economic realism / Generalization / Failure analysis) and
descriptive-vs-decision-bearing status are part of the registration.
Stopping rules and contamination controls are in
`PHASE30_SPECIFICATION.md` §8–§10 and are binding.

Known constraint carried into every interpretation: **the strategy is
NOT robust to execution delay** (+1 bar ≈ −38% total R, maxDD −18R;
+2 bars ≈ −94%, PF 1.026 — Phase 29). This is context, not a target.

---

## Family A — External / untouched validation (HIGHEST PRIORITY)

### A1 — Post-dataset forward window (primary external validation)

- **ID:** A1
- **Category:** External validation · **Type:** decision-bearing
- **Question:** Does the unchanged Golden Reference retain positive
  behavior on EURUSD data strictly after the historical dataset ends?
- **Hypothesis:** If the historical edge reflects a persistent market
  regularity rather than in-sample artifact, the same logic on unseen
  post-2026-09-25 data shows positive aggregate R/PF with plausible
  drawdowns; if artifact, it shows no such behavior. Small samples are
  expected and are a limitation, not a failure.
- **Data required:** EURUSD daily OHLC, dates **strictly after
  2026-09-25** (the historical dataset's last row), same daily-bar
  granularity. Source must be documented with provider, UTC/GMT
  convention, bid/ask convention, and a SHA-256 recorded before first
  use. Minimum acceptable coverage: **≥ 60 qualifying trading days**.
- **Eligibility / waiting condition (pre-registered):** as of the
  pre-registration date (2026-09-26), 60 qualifying trading days do not
  yet exist after 2026-09-25. Therefore:
  - A1 is **not eligible to execute** until ≥ 60 qualifying trading
    days exist strictly after 2026-09-25.
  - Running A1 before that threshold is **prohibited**.
  - Lack of currently available 60-day coverage is **NOT an
    INCONCLUSIVE result** — the experiment is simply **PENDING / NOT
    YET ELIGIBLE** until the pre-registered coverage threshold is
    reached.
  - Once ≥ 60 qualifying trading days exist, A1 runs **exactly once**.
  - The qualifying window remains **strictly post-2026-09-25**: no
    extension, no truncation, and no discretionary date selection is
    allowed after looking at results.
  - The ≥ 60-day threshold is fixed; **no alternative shorter window
    may be substituted**.
- **Exact methodology:**
  1. Hash and register the new file (`phase30/data/`).
  2. Load via the Golden Reference loader with the new file path and
     `ref.START_DATE` unchanged; run the unchanged signal construction
     (`base_daily` semantics) and `ref.simulate_trades`.
  3. Run **once**. Compute exactly these pre-declared metrics: trades,
     wins/losses, win rate, PF, total R, avg R, maxDD (closed-R,
     exit-order), max losing streak, per-trade table.
  4. No reruns, no variant executions, no metric additions after
     seeing output.
- **Fixed parameters:** all Golden Reference constants (START_DATE
  filter logic applied only to exclude nothing within the new file;
  warm-up = first 60 rows of the new file; EMA20/50, weekly 10/20,
  ATR14, 1×/2× bracket, 1.5-pip friction, next-open entry, gap rules).
- **Fixed seeds:** none required (deterministic).
- **Metrics:** as in step 3 only.
- **Expected outputs:** `phase30/results/A1_forward_trades.csv`,
  `phase30/results/A1_forward_summary.json`, section in
  `PHASE30_RESULTS.md`.
- **Failure criteria (pre-declared):** before the coverage threshold is
  reached, A1 has **no outcome state at all** — it is PENDING / NOT YET
  ELIGIBLE (this is not INCONCLUSIVE and not LIMITED). After the
  threshold is reached and the single run is executed: state SUPPORTED
  requires positive total R **and** PF > 1 with ≥ 5 trades; state MIXED
  if positive R but PF ≤ 1 or n < 5; negative R with ≥ 5 trades is
  recorded as evidence *against* persistence (descriptive — the phase's
  decision states are neutral; this is not a BREAK state). INCONCLUSIVE
  applies only to a post-threshold execution failure (e.g., the run
  cannot complete for a documented technical reason), never to waiting
  for coverage.
- **Contamination controls:** dates strictly outside historical span
  (asserted in code); file hashed before use; Golden Reference and
  historical dataset opened read-only; no parameter is touched after
  output is seen.
- **Explicitly forbidden:** using A1 output to select or adjust
  anything; extending the historical dataset file itself.

### A2 — Independent-source historical window (secondary external validation)

- **ID:** A2
- **Category:** External validation · **Type:** decision-bearing
- **Question:** Does an independent provider's EURUSD history produce
  materially the same frozen-strategy behavior on the same dates?
- **Hypothesis:** If the edge depends on the specific historical file's
  construction, an independent source will diverge materially; if the
  edge is a property of the market, the two agree within data-noise
  tolerances.
- **Data required:** independent EURUSD daily OHLC covering ≥ 5 years
  overlapping 2003-12-01..2026-09-25, with provider/convention metadata
  and SHA-256 registered before use.
- **Exact methodology:**
  1. Hash/register the file; document stamp and quote conventions.
  2. Run the unchanged Golden Reference pipeline once on it.
  3. Pre-declared comparison metrics only: trades, PF, total R, maxDD,
     sign agreement of yearly R vs the frozen ledger's per-year sign.
  4. Report overlap differences descriptively; no reconciliation
     tuning.
- **Fixed parameters:** identical to A1.
- **Fixed seeds:** none.
- **Metrics / outputs:** as above →
  `phase30/results/A2_independent_trades.csv`,
  `phase30/results/A2_independent_summary.json`.
- **Failure criteria:** INCONCLUSIVE if no independent source is
  obtainable; "material divergence" = sign-disagreement in yearly R for
  a majority of years with ≥ 3 trades, or |total-R difference| > 25%
  of control. Divergence is *recorded*, not repaired.
- **Contamination controls:** as A1; additionally, the comparison is
  computed against the **frozen ledger hash-verified at run time**.

---

## Family B — Execution realism (measurement, not repair)

### B1 — Spread-realistic entry cost

- **ID:** B1
- **Category:** Economic realism · **Type:** decision-bearing
- **Question:** How does the frozen result change when the 1.5-pip
  assumption is replaced by documented realistic EURUSD spread + cost
  at entry?
- **Hypothesis:** Phase 29 showed near-linear degradation; realistic
  total entry cost (spread + commission expressed in pips, documented
  from a named broker/feed snapshot) is expected to fall inside the
  already-tested 0–6 pip range, so the expected effect is a modest,
  quantifiable reduction — the deliverable is the *measurement* against
  a documented cost, not a new number hunt.
- **Data required:** historical dataset (frozen); a documented cost
  figure (source URL/snapshot quoted in the results file, captured
  before running).
- **Exact methodology:** single run of the Golden Reference pipeline
  with entry friction = pre-declared documented cost; pre-declared
  metrics: trades, total R, PF, WR, maxDD; compare to control and to
  Phase-29 friction grid interpolation.
- **Fixed parameters:** friction = the documented figure (registered
  below before execution; one value, no grid).
- **Fixed seeds:** none.
- **Metrics/outputs:** → `phase30/results/B1_cost_summary.json`.
- **Failure criteria:** none beyond neutral states — SUPPORTED if
  positive R at the frozen documented cost; MIXED if positive R but
  PF < 1.3; **LIMITED (and no execution) if no source satisfies all
  five selection-rule criteria**.
- **Contamination controls:** cost figure recorded before the run; no
  grid, no iteration; runs on frozen pipeline read-only.
- **Cost-selection rule (FROZEN — deterministic, no discretion):**
  Before execution, identify the **first qualifying public
  broker/source** that satisfies ALL of the following:
  1. publishes a EURUSD trading-cost figure publicly;
  2. clearly identifies whether the figure is spread-only or includes
     commission;
  3. provides a dated/currently accessible source;
  4. provides enough information to convert the total round-trip cost
     into pips;
  5. does not require selecting among multiple competing cost figures
     based on which produces a more favorable result.
  The selected source must be recorded **before the B1 run** with:
  provider/broker name; source/page; access date; quoted cost; whether
  spread and commission are included; exact conversion to pips; and
  the resulting single B1 friction value.
  **If no source satisfies all criteria, B1 becomes LIMITED and is not
  executed.** Once the qualifying source is selected and recorded, that
  single resulting pip value is **frozen**.
  **Binding prohibitions:** no source shopping after seeing B1
  results; no cost grid; no alternate broker comparison; no second B1
  run; no made-up or placeholder cost value is inserted at
  pre-registration time.

### B2 — Next-open feasibility & gap audit

- **ID:** B2
- **Category:** Implementation validation · **Type:** descriptive
- **Question:** Can the next-open entry actually be implemented, given
  the data's own gap structure, and what execution window does the
  +1-bar fragility imply?
- **Hypothesis:** Most entries are ordinary next-session opens; the
  audit quantifies how many entries follow gaps (where "the open" is
  far from the prior close and fills/liquidity may differ), and how
  much of the historical edge accrues on gap-entry days — descriptive
  only.
- **Data required:** frozen dataset + frozen ledger only.
- **Exact methodology:** classify the 115 frozen trades by
  entry-gap size (|open − prior close| in pips and in ATR units);
  cross-tab outcome/R by gap bucket; report the distribution of time
  between the daily open stamp and any available intraday timing
  assumption explicitly listed as NOT AVAILABLE in daily data (the
  limitation is part of the output).
- **Fixed parameters:** bucket edges pre-registered: gap < 0.25×ATR,
  0.25–0.75×ATR, > 0.75×ATR (ATR = signal-day ATR of that trade).
- **Fixed seeds:** none.
- **Metrics/outputs:** bucket counts, R sums, PF per bucket, list of
  the largest-gap entries → `phase30/results/B2_gap_audit.csv` +
  summary section.
- **Failure criteria:** none (descriptive); LIMITATION statement if
  intraday timestamps are unavailable (they are, in daily data —
  recorded as a hard limitation on latency analysis).
- **Contamination controls:** ledger hash gate; classification uses
  entry-time information only; **no filter may be constructed from
  bucket results**.

### B3 — Latency proxy sensitivity (bounded, single experiment)

- **ID:** B3
- **Category:** Implementation validation · **Type:** decision-bearing
- **Question:** Within daily-data limits, what does a *bounded* latency
  proxy cost — an adverse fixed price offset applied at entry on top of
  control friction (distinct from Phase 29's ATR-scaled slippage
  finding, measured here as a plain pips offset, one value)?
- **Hypothesis:** A modest fixed latency offset (≤ 2 pips) costs
  < 10% of total R (Phase 29's adverse-slip result); the experiment
  converts that into an explicit, quotable execution-budget figure.
- **Data required:** frozen dataset only.
- **Exact methodology:** one run with entry = open + 1.5 pips + 2.0
  pips fixed offset; pre-declared metrics: total R, PF, maxDD, trades;
  comparison against Phase-29 A-SLIP rows documented as context.
- **Fixed parameters:** offset = 2.0 pips (pre-registered, single
  value).
- **Fixed seeds:** none.
- **Metrics/outputs:** → `phase30/results/B3_latency_summary.json`.
- **Failure criteria:** SUPPORTED if ≥ 90% of control total R remains;
  MIXED if 70–90%; LIMITED if the offset exceeds any defensible
  latency budget — recorded, not iterated.
- **Contamination controls:** single value, single run; no reruns.

---

## Family C — Data-source sensitivity

### C1 — OHLC-construction sensitivity on the independent source

- **ID:** C1
- **Category:** Robustness · **Type:** descriptive
- **Question:** Do broker-convention differences (bid vs mid, Sunday
  bars, stamp timezone) change the conclusion reached on the
  independent source (links to A2)?
- **Hypothesis:** Conventions shift individual trades but not the
  sign structure of yearly results; where they do shift materially,
  that is recorded as a data-dependence limitation of the historical
  evidence.
- **Data required:** the A2 independent file (same registered file; no
  new download).
- **Exact methodology (mechanically reproducible; exactly two
  variants — no third convention variant may be introduced):**
  recompute the frozen pipeline on the two registered variants and
  compare trades count, PF, total R vs the A2 base run.
  - **Variant 1 — Sunday-bar removal.**
    1. Identify Sunday bars according to the independent source's
       documented calendar/timestamp convention.
    2. Remove those complete daily rows before running the frozen
       strategy.
    3. Do **not** interpolate, merge, resample, or otherwise
       reconstruct OHLC.
    4. All remaining OHLC values remain unchanged.
    5. Document the number of rows removed.
  - **Variant 2 — Timestamp-convention transformation.**
    1. Record the independent source's timestamp timezone/convention.
    2. Record the historical dataset's timestamp timezone/convention.
    3. Calculate the exact fixed UTC offset between them.
    4. Apply that exact fixed offset to **timestamps only**.
    5. Do **not** alter OHLC values.
    6. Reassign calendar dates after the timestamp transformation.
    7. If the transformation causes a date-boundary change, document
       it.
    8. Do **not** resample or reconstruct OHLC.
    9. The exact offset must be **declared before C1 execution**.
    If the two conventions cannot be unambiguously established, C1
    Variant 2 is **LIMITED** rather than being interpreted manually.
- **Fixed parameters:** variants (i) and (ii) only.
- **Fixed seeds:** none.
- **Metrics/outputs:** → `phase30/results/C1_conventions.csv`.
- **Failure criteria:** descriptive; LIMITATION recorded if any
  variant flips the A2 sign conclusion.
- **Contamination controls:** no variant may be added after seeing
  (i) or (ii) results.

---

## Family D — Cross-pair generalization

### D1 — Frozen mechanism on additional pairs (descriptive transfer)

- **ID:** D1
- **Category:** Generalization · **Type:** descriptive
- **Question:** Does the same frozen mechanism generalize beyond
  EURUSD — and if other pairs fail, is that a scope limitation or
  evidence against the mechanism?
- **Hypothesis (prior from Phases 27/29):** transfer is weak
  (GBPUSD +4.40R full / AUDUSD −8.98R full); additional pairs are
  expected to behave inconsistently; the deliverable is a quantified
  transfer statement, not new candidates.
- **Data required (UNIVERSE FROZEN — exactly six pairs; no other pair
  may ever be added):**
  1. GBPUSD
  2. USDJPY
  3. AUDUSD
  4. NZDUSD
  5. USDCHF
  6. USDCAD
  Per-pair data rules: if an already registered historical file exists
  (GBPUSD, USDJPY, AUDUSD repo files), use it after hash verification;
  if an external file is required (NZDUSD, USDCHF, USDCAD), it must be
  registered and hashed **before any D1 output is generated**; if a
  pair's required data cannot be obtained under the contamination
  rules, mark that pair **UNAVAILABLE/LIMITED**. Do not replace an
  unavailable pair with another pair; do not remove a pair because
  preliminary results are unfavorable; do not add a pair because
  preliminary results look favorable.
- **Exact methodology:** unchanged Golden Reference logic per pair
  (PIP constant per pair as in Phase 29); one run each; pre-declared
  metrics: trades, total R, PF, WR, maxDD, full-history and
  2010–2025 slices; a transfer table (per-pair R/PF vs EURUSD
  control); **no pooling**.
- **Fixed parameters:** all Golden Reference constants; per-pair PIP
  only.
- **Fixed seeds:** none.
- **Metrics/outputs:** → `phase30/results/D1_transfer_table.csv`.
- **Failure criteria:** none (descriptive); interpretation rule
  pre-registered: if ≥ 2 additional pairs beyond the known weak set
  show positive PF > 1.2, mechanism generalization is *plausible*;
  otherwise the evidence remains EURUSD-specific and any further
  research is scoped to EURUSD only.
- **Contamination controls:** no per-pair adjustment; the six-pair
  universe is frozen at pre-registration — no pair may be added,
  removed, or replaced at any time, before or after results.

---

## Family E — Failure analysis

### E1 — Losing-trade characterization

- **ID:** E1
- **Category:** Failure analysis · **Type:** descriptive
- **Question:** When the strategy loses, can losses be characterized
  without inventing a new filter?
- **Hypothesis:** Losses concentrate in identifiable entry-time
  conditions (e.g., high-ATR entries, tight trend width, specific
  regimes); characterization quantifies this descriptively and states
  whether any observed pattern would have been *knowable at entry*.
- **Data required:** frozen ledger + Phase-27 enriched diagnostics
  (hash-verified) + frozen dataset.
- **Exact methodology:** partition the 66 stop-outcome trades by
  pre-declared entry-time variables only: signal-day ATR percentile
  (Phase-27 column), daily EMA20−EMA50 gap tercile, weekly regime
  state, gap-at-entry bucket (B2 edges), calendar year; report per-bucket
  loss frequency, avg R, contribution to the −12R episode; explicitly
  mark which partitions use only signal-time information.
- **Fixed parameters:** partitions as listed; no others may be added.
- **Fixed seeds:** none.
- **Metrics/outputs:** → `phase30/results/E1_failure_analysis.csv` +
  narrative.
- **Failure criteria:** none (descriptive). **Binding rule:** any
  pattern found is recorded as a research question for a future
  pre-registered phase; constructing or even backtesting a filter from
  E1 output inside Phase 30 is prohibited.
- **Contamination controls:** entry-time variables only; ledger and
  Phase-27 file hash gates.

---

## Execution order (after audit authorization)

A1 → A2 → B1 → B2 → B3 → C1 → D1 → E1. Each family runs once, produces
its registered artifacts, receives its neutral state, and stops. Phase 30
completes with `PHASE30_RESULTS.md` mapping per-family states to the
single question: *is the Phase-29 historical edge sufficiently
trustworthy for further research, and under what documented limitations?*

## Pre-registration integrity

- This registry is committed before any Phase-30 execution.
- The phase-29 pattern applies: hash gates before/after every run;
  results byte-deterministic; seeds recorded; artifacts registered with
  SHA-256 in `PHASE30_RESULTS.md`.
- Any deviation from this registry discovered during execution is a
  reportable breach, not a fixable detail.
