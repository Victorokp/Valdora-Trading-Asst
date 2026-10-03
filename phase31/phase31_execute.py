#!/usr/bin/env python3
"""Phase 31 execution — statistical evidence & dependence audit.

Executes exactly the preregistered families A1, B1, (B2 consumption),
C1, C2, C3 of PHASE31_EXPERIMENT_REGISTRY.md @ commit 1551f0f.
Deterministic; fixed seeds; fixed counts; no adaptive branching.
Documentary families D1, D2 and synthesis E1 are authored separately
from these outputs; the preregistered hash gates run before and after.

Outputs (phase31/results/):
  A1_block_resampling.csv   A1_summary.json
  B1_sign_permutation.csv   B1_summary.json
  C1_concentration.csv
  C2_clusters.csv           C2_summary.json
  C3_drawdown_structure.csv
  phase31_runtime_log.json
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "phase21_experiment_results" / "phase21_trades.csv"
B2_ARTIFACT = ROOT / "phase29" / "results" / "phase29_summary.json"
OUT = ROOT / "phase31" / "results"

GOLDEN_REFERENCE_SHA256 = (
    "b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95"
)
DATASET_SHA256 = (
    "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52"
)
LEDGER_SHA256 = (
    "30d22be417fbdd0d3db011bce4b0ac2f785f088d30a8dc10900905e7ae2f70d0"
)
A1_SEEDS = {"monthly": 20260926, "quarterly": 20260927, "yearly": 20260928}
B1_SEED = 20260929
N_RESAMPLES = 10_000
N_PERMS = 10_000
OBSERVED_TOTAL_R = 32.2644
OBSERVED_MAXDD = -12.0

TIER1_MANIFEST = [
    "phase29/phase29_stress.py",
    "phase29/tests/test_phase29_gates.py",
    "PHASE29_STRESS_RESULTS.csv",
    "PHASE29_EXECUTION_STRESS.csv",
    "PHASE29_PARAMETER_SENSITIVITY.csv",
    "PHASE29_DRAWDOWN_STRESS.csv",
    "PHASE29_TEMPORAL_STRESS.csv",
    "PHASE29_REGIME_STRESS.csv",
    "phase29/results/PHASE29_STRESS_RESULTS.csv",
    "phase29/results/PHASE29_EXECUTION_STRESS.csv",
    "phase29/results/PHASE29_PARAMETER_SENSITIVITY.csv",
    "phase29/results/PHASE29_TEMPORAL_STRESS.csv",
    "phase29/results/PHASE29_REGIME_STRESS.csv",
    "phase29/results/phase29_summary.json",
    "phase29/results/phase29_control_baseline.csv",
    "phase29/results/phase29_drawdown_stress.json",
    "phase29/results/hashes.txt",
    "PHASE29_EXPERIMENT_REGISTRY.md",
    "PHASE29_SPECIFICATION.md",
]
TIER2_FILES = [
    "PHASE29_ROBUSTNESS_REPORT.md",
    "PHASE29_DATA_AUDIT.md",
    "PHASE29_DECISION.md",
]
PHASE30_FILES = ["PHASE30_SPECIFICATION.md", "PHASE30_EXPERIMENT_REGISTRY.md"]
P29_EXP_COMMIT = "a3dc35ee9a51d42dd3c56f239deac9cd60d726e9"
P29_DOC_COMMIT = "2011d2385b525be92d5e39fcb214ee44661a7479"
P30_COMMIT = "3831031f02938125fd34d9e18eb9ce2562fe992e"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def gate(tag: str) -> dict:
    """Contamination/integrity gate (spec section 8). Stops on breach."""
    checks = {
        "golden_reference": sha256_file(ROOT / "phase21_historical_reference.py"),
        "dataset": sha256_file(ROOT / "eurusd_d.csv"),
        "ledger": sha256_file(LEDGER),
    }
    tier1, tier2, p30 = [], [], []
    for f in TIER1_MANIFEST:
        a = subprocess.run(["git", "rev-parse", f"{P29_EXP_COMMIT}:{f}"],
                           capture_output=True, text=True, cwd=ROOT
                           ).stdout.strip()[:12]
        b = subprocess.run(["git", "hash-object", f],
                           capture_output=True, text=True, cwd=ROOT
                           ).stdout.strip()[:12]
        tier1.append({"file": f, "ok": a == b})
    for f in TIER2_FILES:
        a = subprocess.run(["git", "rev-parse", f"{P29_DOC_COMMIT}:{f}"],
                           capture_output=True, text=True, cwd=ROOT
                           ).stdout.strip()[:12]
        b = subprocess.run(["git", "hash-object", f],
                           capture_output=True, text=True, cwd=ROOT
                           ).stdout.strip()[:12]
        tier2.append({"file": f, "ok": a == b})
    for f in PHASE30_FILES:
        a = subprocess.run(["git", "rev-parse", f"{P30_COMMIT}:{f}"],
                           capture_output=True, text=True, cwd=ROOT
                           ).stdout.strip()[:12]
        b = subprocess.run(["git", "hash-object", f],
                           capture_output=True, text=True, cwd=ROOT
                           ).stdout.strip()[:12]
        p30.append({"file": f, "ok": a == b})
    result = {
        "tag": tag,
        "hashes": checks,
        "tier1_all_ok": all(x["ok"] for x in tier1),
        "tier2_all_ok": all(x["ok"] for x in tier2),
        "phase30_all_ok": all(x["ok"] for x in p30),
        "tier1": tier1, "tier2": tier2, "phase30": p30,
    }
    ok = (checks["golden_reference"] == GOLDEN_REFERENCE_SHA256
          and checks["dataset"] == DATASET_SHA256
          and checks["ledger"] == LEDGER_SHA256
          and result["tier1_all_ok"] and result["tier2_all_ok"]
          and result["phase30_all_ok"])
    result["gate_pass"] = ok
    print(f"[gate:{tag}] pass={ok} "
          f"tier1={result['tier1_all_ok']} tier2={result['tier2_all_ok']} "
          f"p30={result['phase30_all_ok']}")
    if not ok:
        with open(OUT / "phase31_runtime_log.json", "w") as fh:
            json.dump({"breach": result}, fh, indent=2)
        raise SystemExit("PHASE 31 STOP: integrity gate breach — see log.")
    return result


def period_stats(rs: pd.Series) -> dict:
    wins, losses = rs[rs > 0], rs[rs <= 0]
    cum = rs.cumsum()
    streak = worst = 0
    for r in rs:
        streak = streak + 1 if r <= 0 else 0
        worst = max(worst, streak)
    return {
        "total_R": round(float(rs.sum()), 4),
        "profit_factor": (round(float(wins.sum() / -losses.sum()), 4)
                          if len(losses) and losses.sum() != 0 else None),
        "max_drawdown_R": round(float((cum - cum.cummax()).min()), 4),
        "max_losing_streak": int(worst),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    gate("pre-execution")
    pre_gate = None

    ledger = pd.read_csv(LEDGER)
    ledger["exit_date"] = pd.to_datetime(ledger["exit_date"])
    ledger = ledger.sort_values("exit_date").reset_index(drop=True)
    rs = ledger["r_multiple"]
    log = {
        "python": sys.version.split()[0], "pandas": pd.__version__,
        "numpy": np.__version__,
        "inputs": {
            "ledger": LEDGER.name, "ledger_sha256": LEDGER_SHA256,
            "b2_artifact": str(B2_ARTIFACT.relative_to(ROOT)),
            "b2_artifact_sha256": sha256_file(B2_ARTIFACT),
        },
    }

    # ---------------- A1 — fixed-block resampling ----------------
    a1_rows, a1_summaries = [], []
    for block_name, seed in A1_SEEDS.items():
        if block_name == "monthly":
            keys = ledger["exit_date"].dt.to_period("M").astype(str)
        elif block_name == "quarterly":
            keys = ledger["exit_date"].dt.to_period("Q").astype(str)
        else:
            keys = ledger["exit_date"].dt.year.astype(str)
        blocks = {k: g.index.to_numpy() for k, g in ledger.groupby(keys)}
        block_keys = list(blocks)
        rng = np.random.default_rng(seed)
        totals, pfs, dds, streaks = [], [], [], []
        for _ in range(N_RESAMPLES):
            picked: list[int] = []
            while len(picked) < len(ledger):
                k = block_keys[rng.integers(len(block_keys))]
                picked.extend(blocks[k].tolist())
            idx = picked[: len(ledger)]
            s = period_stats(rs.iloc[idx].reset_index(drop=True))
            totals.append(s["total_R"]); pfs.append(s["profit_factor"])
            dds.append(s["max_drawdown_R"])
            streaks.append(s["max_losing_streak"])
        totals_a, pfs_a, dds_a = np.array(totals), np.array(
            [p for p in pfs if p is not None]), np.array(dds)
        a1_summaries.append({
            "block": block_name, "seed": seed, "resamples": N_RESAMPLES,
            "p_total_R_le_0": round(float((totals_a <= 0).mean()), 6),
            "p_total_R_ge_observed": round(
                float((totals_a >= OBSERVED_TOTAL_R).mean()), 6),
            "total_R_pctl": {p: round(float(np.percentile(totals_a, p)), 4)
                             for p in (1, 5, 25, 50, 75, 95, 99)},
            "PF_pctl": {p: round(float(np.percentile(pfs_a, p)), 4)
                        for p in (5, 50, 95)},
            "maxDD_pctl": {p: round(float(np.percentile(dds_a, p)), 4)
                           for p in (1, 5, 50, 95)},
            "max_losing_streak_pctl": {
                p: int(np.percentile(streaks, p)) for p in (50, 95)},
        })
        a1_rows.append({"block": block_name, "seed": seed,
                        "resamples": N_RESAMPLES,
                        **a1_summaries[-1]})
    pd.DataFrame(a1_rows).to_csv(OUT / "A1_block_resampling.csv", index=False)
    with open(OUT / "A1_summary.json", "w") as fh:
        json.dump({"observed_total_R": OBSERVED_TOTAL_R,
                   "observed_maxDD_R": OBSERVED_MAXDD,
                   "n_trades": len(ledger),
                   "definitions": a1_summaries}, fh, indent=2)

    # ---------------- B1 — trade-sign permutation ----------------
    rng = np.random.default_rng(B1_SEED)
    mags = rs.abs().to_numpy()
    null_totals, null_dds, null_streaks = [], [], []
    for _ in range(N_PERMS):
        signs = rng.choice([-1.0, 1.0], size=len(mags))
        perm = pd.Series(mags * signs)
        s = period_stats(perm)
        null_totals.append(s["total_R"]); null_dds.append(s["max_drawdown_R"])
        null_streaks.append(s["max_losing_streak"])
    nt, nd = np.array(null_totals), np.array(null_dds)
    b1 = {
        "seed": B1_SEED, "permutations": N_PERMS,
        "null_total_R_pctl": {p: round(float(np.percentile(nt, p)), 4)
                              for p in (1, 5, 25, 50, 75, 95, 99)},
        "observed_percentile_total_R": round(
            float((nt < OBSERVED_TOTAL_R).mean() * 100.0), 4),
        "p_null_ge_observed": round(float((nt >= OBSERVED_TOTAL_R).mean()), 6),
        "null_maxDD_pctl": {p: round(float(np.percentile(nd, p)), 4)
                            for p in (1, 5, 50, 95)},
        "observed_percentile_maxDD": round(
            float((nd <= OBSERVED_MAXDD).mean() * 100.0), 4),
        "null_max_losing_streak_p50": int(np.percentile(null_streaks, 50)),
        "null_max_losing_streak_p95": int(np.percentile(null_streaks, 95)),
        "interpretation_guard": (
            "Descriptive reference statistics under the stated fair-coin "
            "sign-randomization model; NOT a definitive p-value for the "
            "strategy (preregistered guard)."),
    }
    b1_rows = [{"percentile": p, "null_total_R": b1["null_total_R_pctl"][p],
                "null_maxDD": b1["null_maxDD_pctl"].get(p)}
               for p in (1, 5, 25, 50, 75, 95, 99)]
    pd.DataFrame(b1_rows).to_csv(OUT / "B1_sign_permutation.csv", index=False)
    with open(OUT / "B1_summary.json", "w") as fh:
        json.dump(b1, fh, indent=2)

    # ---------------- B2 — consumption only ----------------
    with open(B2_ARTIFACT) as fh:
        b2 = json.load(fh)
    b2_consumed = {"source": str(B2_ARTIFACT.relative_to(ROOT)),
                   "source_sha256": sha256_file(B2_ARTIFACT),
                   "g_order_stress": b2["g_order_stress"],
                   "note": "Consumed read-only; no rerun, no re-seed."}
    with open(OUT / "B2_consumed.json", "w") as fh:
        json.dump(b2_consumed, fh, indent=2)

    # ---------------- C1 — concentration ----------------
    winners = ledger[rs > 0].sort_values("r_multiple", ascending=False)
    gross = float(rs[rs > 0].sum())
    by_year = ledger.groupby(ledger["exit_date"].dt.year)["r_multiple"].sum()
    by_q = ledger.groupby(ledger["exit_date"].dt.to_period("Q"))["r_multiple"].sum()
    by_m = ledger.groupby(ledger["exit_date"].dt.to_period("M"))["r_multiple"].sum()
    c1 = {
        "largest_winner_R": round(float(winners["r_multiple"].iloc[0]), 4),
        "top5_winners_R": round(float(winners["r_multiple"].head(5).sum()), 4),
        "top10_winners_R": round(float(winners["r_multiple"].head(10).sum()), 4),
        "gross_profit_R": round(gross, 4),
        "largest_winner_share_of_gross_pct": round(
            float(winners["r_multiple"].iloc[0]) / gross * 100.0, 4),
        "top5_share_of_gross_pct": round(
            float(winners["r_multiple"].head(5).sum()) / gross * 100.0, 4),
        "top10_share_of_gross_pct": round(
            float(winners["r_multiple"].head(10).sum()) / gross * 100.0, 4),
        "by_year": {str(k): round(float(v), 4) for k, v in by_year.items()},
        "by_quarter": {str(k): round(float(v), 4) for k, v in by_q.items()},
        "by_month": {str(k): round(float(v), 4) for k, v in by_m.items()},
    }
    rows = ([{"metric": "largest_winner_R", "value": c1["largest_winner_R"]},
             {"metric": "top5_winners_R", "value": c1["top5_winners_R"]},
             {"metric": "top10_winners_R", "value": c1["top10_winners_R"]},
             {"metric": "gross_profit_R", "value": c1["gross_profit_R"]},
             {"metric": "largest_winner_share_pct",
              "value": c1["largest_winner_share_of_gross_pct"]},
             {"metric": "top5_share_pct", "value": c1["top5_share_of_gross_pct"]},
             {"metric": "top10_share_pct", "value": c1["top10_share_of_gross_pct"]}]
            + [{"metric": f"year_{k}", "value": v}
               for k, v in c1["by_year"].items()]
            + [{"metric": f"quarter_{k}", "value": v}
               for k, v in c1["by_quarter"].items()]
            + [{"metric": f"month_{k}", "value": v}
               for k, v in c1["by_month"].items()])
    pd.DataFrame(rows).to_csv(OUT / "C1_concentration.csv", index=False)

    # ---------------- C2 — cluster structure ----------------
    win_runs, loss_runs, cur_w, cur_l = [], [], 0, 0
    for r in rs:
        if r > 0:
            cur_w += 1
            if cur_l: loss_runs.append(cur_l); cur_l = 0
        else:
            cur_l += 1
            if cur_w: win_runs.append(cur_w); cur_w = 0
    if cur_w: win_runs.append(cur_w)
    if cur_l: loss_runs.append(cur_l)
    c2 = {
        "longest_winning_streak": int(max(win_runs)),
        "longest_losing_streak": int(max(loss_runs)),
        "n_winning_clusters": len(win_runs),
        "n_losing_clusters": len(loss_runs),
        "win_run_distribution": {str(k): int(v) for k, v in
                                 pd.Series(win_runs).value_counts()
                                 .sort_index().items()},
        "loss_run_distribution": {str(k): int(v) for k, v in
                                  pd.Series(loss_runs).value_counts()
                                  .sort_index().items()},
    }
    pd.DataFrame([c2]).to_csv(OUT / "C2_clusters.csv", index=False)
    with open(OUT / "C2_summary.json", "w") as fh:
        json.dump(c2, fh, indent=2)

    # ---------------- C3 — drawdown/recovery structure ----------------
    eq = rs.cumsum()
    dd = eq - eq.cummax()
    episodes, cur_depth, cur_len, cur_start = [], None, 0, 0
    recovs, in_dd = [], False
    for i, v in enumerate(dd):
        if v < 0:
            if not in_dd:
                in_dd, cur_depth, cur_len, cur_start = True, v, 1, i
            else:
                cur_len += 1
                cur_depth = min(cur_depth, v)
        elif in_dd:
            episodes.append({"depth_R": round(float(cur_depth), 4),
                             "duration_trades": cur_len,
                             "recovery_trades": 1})
            recovs.append(1)
            in_dd = False
    if in_dd:
        episodes.append({"depth_R": round(float(cur_depth), 4),
                         "duration_trades": cur_len, "recovery_trades": None})
    for i, ep in enumerate(episodes):
        end = sum(e["duration_trades"] for e in episodes[:i + 1]) \
            + sum(e["recovery_trades"] or 0 for e in episodes[:i])
        # locate recovery length: trades from episode end back to new peak
        j = end
        rec = 0
        while j < len(dd) and dd.iloc[j] < 0:
            j += 1
        rec = j - end + (1 if ep["recovery_trades"] else 0)
        ep["recovery_trades"] = int(rec) if ep["recovery_trades"] is not None else None
    c3 = {
        "n_episodes": len(episodes),
        "episodes": episodes,
        "total_time_underwater_trades": int((dd < 0).sum()),
        "largest_recovery_requirement_trades": int(max(
            [e["recovery_trades"] or 0 for e in episodes] or [0])),
        "max_drawdown_R": round(float(dd.min()), 4),
    }
    pd.DataFrame(episodes).to_csv(OUT / "C3_drawdown_structure.csv",
                                  index=False)

    # ---------------- write runtime log ----------------
    log.update({
        "a1": A1_SEEDS, "a1_resamples": N_RESAMPLES,
        "b1_seed": B1_SEED, "b1_permutations": N_PERMS,
        "a1_summaries": a1_summaries, "b1": b1, "b2": b2_consumed,
        "c1": c1, "c2": c2, "c3": c3,
    })
    with open(OUT / "phase31_runtime_log.json", "w") as fh:
        json.dump(log, fh, indent=2, default=str)

    post = gate("post-execution")
    log["post_gate_pass"] = post["gate_pass"]
    with open(OUT / "phase31_runtime_log.json", "w") as fh:
        json.dump(log, fh, indent=2, default=str)
    print(json.dumps({"a1": a1_summaries, "b1": b1, "c2": c2,
                      "c3_n_episodes": c3["n_episodes"]}, indent=2,
                     default=str))


if __name__ == "__main__":
    main()
