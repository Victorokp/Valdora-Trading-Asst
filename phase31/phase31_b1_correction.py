#!/usr/bin/env python3
"""Phase 31 B1 corrective rerun — executes PHASE31_B1_CORRECTION_PROTOCOL.md
@ commit 8c6e5f10eb055d2616320068bda9e56ac365dd25.

Corrects exactly one deviation from the original B1 execution
(phase31/phase31_execute.py @ 76e9c3e): the preregistered SHUFFLE of the
signed sequence was omitted there; it is performed here, after sign
randomization and before the order-dependent metrics.

Frozen parameters (no freedom):
  input        phase21_experiment_results/phase21_trades.csv (115 trades)
  RNG          numpy.random.default_rng(20260929) — the single RNG for the
               whole procedure (sign draws AND the shuffle draw)
  permutations exactly 10,000
  sign p       0.5 (fair coin)
  metrics      total R, max drawdown (cum from 0, dd = cum - running max,
               reported negative), maximum losing streak (consecutive R <= 0)
  outputs      phase31/results/B1_sign_permutation_CORRECTED.csv
               phase31/results/B1_summary_CORRECTED.json
               phase31/results/B1_CORRECTION_EXECUTION.md

Nothing else is written; no existing artifact is opened for writing. The
integrity gate and metric conventions are the original module's own
definitions, imported read-only from phase31/phase31_execute.py.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import platform
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Read-only import of the original execution module: reuses its frozen
# integrity gate() and period_stats() definitions verbatim so every
# convention is identical to the preregistered Phase-31 execution.
_spec = importlib.util.spec_from_file_location(
    "phase31_execute", ROOT / "phase31" / "phase31_execute.py")
_orig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_orig)  # guarded by if __name__ == "__main__"

gate = _orig.gate
period_stats = _orig.period_stats
LEDGER = _orig.LEDGER
OUT = _orig.OUT

PROTOCOL_COMMIT = "8c6e5f10eb055d2616320068bda9e56ac365dd25"
FORENSIC_COMMIT = "6c95d0123db7af028c1cbdca28619d361ce7746d"
ORIGINAL_EXEC_COMMIT = "76e9c3eab3a179dd6d21c5556c74d97a9fa451a0"
B1_SEED = 20260929
N_PERMS = 10_000
OBSERVED_TOTAL_R = 32.2644
OBSERVED_MAXDD = -12.0
PERCENTILES = (1, 5, 25, 50, 75, 95, 99)

B1_CSV = OUT / "B1_sign_permutation_CORRECTED.csv"
B1_JSON = OUT / "B1_summary_CORRECTED.json"
B1_MD = OUT / "B1_CORRECTION_EXECUTION.md"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    pre = gate("b1-correction-pre")

    ledger = pd.read_csv(LEDGER)
    ledger["exit_date"] = pd.to_datetime(ledger["exit_date"])
    ledger = ledger.sort_values("exit_date").reset_index(drop=True)
    assert len(ledger) == 115, f"ledger must hold exactly 115 trades, got {len(ledger)}"
    rs = ledger["r_multiple"]

    # ---------------- B1 (corrected) — sign randomization THEN shuffle -----
    rng = np.random.default_rng(B1_SEED)          # the single frozen RNG
    mags = rs.abs().to_numpy()                    # Step 1: magnitudes only
    null_totals, null_dds, null_streaks = [], [], []
    for _ in range(N_PERMS):
        signs = rng.choice([-1.0, 1.0], size=len(mags))   # Step 2+3: p=0.5
        perm = pd.Series(mags * signs)                     # signed sequence
        perm = perm.sample(frac=1.0, random_state=rng      # Step 4: SHUFFLE
                           ).reset_index(drop=True)
        s = period_stats(perm)                             # Step 5: metrics
        null_totals.append(s["total_R"])
        null_dds.append(s["max_drawdown_R"])
        null_streaks.append(s["max_losing_streak"])
    nt, nd = np.array(null_totals), np.array(null_dds)

    b1c = {
        "experiment": "B1 (corrected) — trade-sign permutation with shuffle",
        "protocol_commit": PROTOCOL_COMMIT,
        "original_execution_commit": ORIGINAL_EXEC_COMMIT,
        "forensic_correction_commit": FORENSIC_COMMIT,
        "input_ledger": "phase21_experiment_results/phase21_trades.csv",
        "input_ledger_sha256": _orig.LEDGER_SHA256,
        "n_trades": len(ledger),
        "seed": B1_SEED,
        "rng": "numpy.random.default_rng(20260929) — single RNG for sign "
               "randomization and shuffle",
        "permutations": N_PERMS,
        "sign_probability": 0.5,
        "shuffle_performed": True,
        "shuffle_detail": "pandas Series.sample(frac=1.0, random_state=rng) "
                          "after sign randomization, before metrics — the "
                          "step omitted by the original execution",
        "null_total_R_pctl": {p: round(float(np.percentile(nt, p)), 4)
                              for p in PERCENTILES},
        "observed_total_R": OBSERVED_TOTAL_R,
        "observed_percentile_total_R": round(
            float((nt < OBSERVED_TOTAL_R).mean() * 100.0), 4),
        "p_null_ge_observed": round(float((nt >= OBSERVED_TOTAL_R).mean()), 6),
        "null_maxDD_pctl": {p: round(float(np.percentile(nd, p)), 4)
                            for p in PERCENTILES},
        "observed_maxDD_R": OBSERVED_MAXDD,
        "observed_percentile_maxDD": round(
            float((nd <= OBSERVED_MAXDD).mean() * 100.0), 4),
        "null_max_losing_streak_p50": int(np.percentile(null_streaks, 50)),
        "null_max_losing_streak_p95": int(np.percentile(null_streaks, 95)),
        "interpretation_guard": (
            "Descriptive reference distribution under the stated fair-coin "
            "sign-randomization model; NOT a definitive p-value for the "
            "strategy (preregistered guard, binding)."),
        "corrective_rerun_note": (
            "Corrective rerun of the preregistered B1 method, not the "
            "original preregistered execution and not a replacement of it; "
            "the original B1 artifacts remain preserved untouched. No other "
            "Phase-31 family was rerun."),
    }

    b1_rows = [{"percentile": p, "null_total_R": b1c["null_total_R_pctl"][p],
                "null_maxDD": b1c["null_maxDD_pctl"][p]} for p in PERCENTILES]
    pd.DataFrame(b1_rows).to_csv(B1_CSV, index=False)
    with open(B1_JSON, "w") as fh:
        json.dump(b1c, fh, indent=2)

    post = gate("b1-correction-post")

    env = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "numpy": np.__version__,
        "pandas": pd.__version__,
    }
    script_sha = sha256_file(Path(__file__).resolve())
    csv_sha, json_sha = sha256_file(B1_CSV), sha256_file(B1_JSON)

    md = f"""# B1_CORRECTION_EXECUTION.md — Phase-31 B1 corrective rerun record

**Status: EXECUTED (corrective rerun).** This record documents the single
corrective B1 execution preregistered in
`PHASE31_B1_CORRECTION_PROTOCOL.md`.

## Evidence-chain references

- Original execution commit: `{ORIGINAL_EXEC_COMMIT}` (preserved exactly;
  never modified, never amended)
- Forensic correction commit: `{FORENSIC_COMMIT}`
- Correction protocol commit: `{PROTOCOL_COMMIT}`
  (`PHASE31_B1_CORRECTION_PROTOCOL.md`)
- This corrective execution commit: the commit that introduces
  `phase31/phase31_b1_correction.py` and the three corrected artifacts
  below onto `phase29-stress` with the message
  "Phase 31: execute preregistered B1 correction" (single append-only
  commit; this document is committed once and never amended — its SHA is
  read from the branch git log)

## Input (frozen, verified)

- Ledger: `phase21_experiment_results/phase21_trades.csv`
- SHA-256: `{_orig.LEDGER_SHA256}` (verified before and after execution)
- Trades: exactly 115 (exit-date order). Not downloaded, regenerated,
  filtered, reordered, or modified.

## Frozen randomization (exactly as preregistered)

- RNG: `numpy.random.default_rng({B1_SEED})` — one single RNG governs the
  entire prescribed procedure (sign randomization AND the shuffle draw).
- Seed: `{B1_SEED}`; permutations: exactly {N_PERMS}; sign probability: 0.5.
- No second RNG, no bootstrap, no magnitude resampling, no change to the
  observation count, no alternative null model, no p-value corrections,
  no confidence intervals, no additional tests, no parameter searches.

## Exact operation order (per permutation, {N_PERMS} permutations)

1. Extract the absolute magnitude of each of the 115 trade R values.
2. Independently assign each magnitude a random sign with probability 0.5
   (`rng.choice([-1.0, 1.0], size=115)` on the single frozen RNG).
3. Construct the resulting 115 signed R values.
4. **Shuffle the signed sequence** — `Series.sample(frac=1.0,
   random_state=rng)` — performed after sign randomization and before the
   order-dependent metrics. **Confirmation: the mandatory shuffle WAS
   performed on all {N_PERMS} permutations.** This is the step omitted by
   the original execution.
5. Calculate on the shuffled sequence: total R; maximum drawdown
   (cumulative R from 0, dd = cum − running max, reported negative);
   maximum losing streak (consecutive R ≤ 0). Definitions identical to
   the frozen registry (`period_stats` of the original module, reused
   verbatim).

## Environment

- Python {env['python']} · numpy {env['numpy']} · pandas {env['pandas']}
- Platform: {env['platform']}
- Execution script: `phase31/phase31_b1_correction.py`
  (SHA-256 at execution time: `{script_sha}`)

## Integrity gates (original module's `gate()`, run before and after)

- Pre-execution gate: pass={pre['gate_pass']} · Tier-1={pre['tier1_all_ok']} (19 files vs
  `{_orig.P29_EXP_COMMIT[:12]}`) · Tier-2={pre['tier2_all_ok']} (3 files vs
  `{_orig.P29_DOC_COMMIT[:12]}`) · Phase-30={pre['phase30_all_ok']} (2 files vs
  `{_orig.P30_COMMIT[:12]}`) · Golden Reference / dataset / ledger
  SHA-256 all exact.
- Post-execution gate: pass={post['gate_pass']} · Tier-1={post['tier1_all_ok']} ·
  Tier-2={post['tier2_all_ok']} · Phase-30={post['phase30_all_ok']} · immutable hashes
  unchanged.
- Original Phase-31 execution artifacts re-verified byte-identical to
  `{ORIGINAL_EXEC_COMMIT[:12]}` after execution; forensic documentation
  state preserved at `{FORENSIC_COMMIT[:12]}`.

## Generated artifacts (SHA-256)

| Artifact | SHA-256 |
|---|---|
| `phase31/results/B1_sign_permutation_CORRECTED.csv` | `{csv_sha}` |
| `phase31/results/B1_summary_CORRECTED.json` | `{json_sha}` |
| `phase31/results/B1_CORRECTION_EXECUTION.md` | this record |

## Headline corrected results (descriptive; guard below)

- Null total-R percentiles (1/5/25/50/75/95/99):
  {', '.join(f"{p}: {b1c['null_total_R_pctl'][p]:+.4f}R" for p in PERCENTILES)}
- Observed +32.2644R: percentile {b1c['observed_percentile_total_R']} of the
  null; P(null total R ≥ observed) = {b1c['p_null_ge_observed']}
- Null maxDD percentiles (1/5/25/50/75/95/99):
  {', '.join(f"{p}: {b1c['null_maxDD_pctl'][p]:.4f}R" for p in PERCENTILES)}
- Observed −12R maxDD: percentile {b1c['observed_percentile_maxDD']} of the
  null maxDD distribution
- Null max losing streak p50/p95: {b1c['null_max_losing_streak_p50']} /
  {b1c['null_max_losing_streak_p95']}

## Interpretation guard (preregistered, binding)

This is a **descriptive reference distribution under the stated
randomization model**. It must **NOT** be presented as a definitive
strategy p-value. The exchangeability/independence assumptions behind
such a reading are examined in the Phase-31 synthesis and stated as
limitations.

## Confirmations

- The original B1 artifacts (`B1_sign_permutation.csv`,
  `B1_summary.json`, runtime-log B1 block) remain **untouched and
  byte-identical to `{ORIGINAL_EXEC_COMMIT[:12]}`**; nothing was
  overwritten, regenerated, or deleted.
- This execution is a **corrective rerun, not the original preregistered
  execution** and not a replacement of the historical record.
- **No other Phase-31 family was rerun**: A1, B2 (consumption), C1, C2,
  C3, D1, D2, E1 are unchanged. The C3 reconciliation at
  `{FORENSIC_COMMIT[:12]}` is not re-opened. E1 is not modified by this
  execution.
"""
    with open(B1_MD, "w") as fh:
        fh.write(md)

    print(json.dumps({
        "b1_corrected": b1c,
        "artifact_hashes": {"B1_sign_permutation_CORRECTED.csv": csv_sha,
                            "B1_summary_CORRECTED.json": json_sha},
        "pre_gate_pass": pre["gate_pass"], "post_gate_pass": post["gate_pass"],
    }, indent=2, default=str))


if __name__ == "__main__":
    main()
