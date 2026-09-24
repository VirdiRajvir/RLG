"""
Independent metric computation: re-grades every trajectory with f8_aspect
removed from the final 5-feature composite score, to check how much of the
human-vs-AI gap (or any other pattern) depends on aspect-ratio match
specifically.

Does NOT refit weights on the remaining 4 features — it simply drops f8's
term from the weighted sum and renormalizes by the new sum of weights, so a
self-vs-self page (all remaining features = 1.0) still scores exactly 1.0.
Raw coefficients (coef_raw, not the standardized coef_std) are read directly
from analysis/prefelic_refit/weights_final.csv, matching the convention
data.py's _weight_vector() uses for the real metric.

Deliberately self-contained — does not import data.py — so the no-f8 metric
computation is auditable on its own rather than threaded through the main
pipeline's condition-bucketing logic.

Scope: human (h2a, k>=2 qualifying, 5 references) + the 3 base a2a
conditions (claude_uncapped, gemini, qwen) — no Claude ablation conditions.
Produces one uncapped (no turn-cap) trend curve in figs/no_f8/.

  python3.10 paper/scripts/metric_no_f8.py
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from style import COLORS, LABELS, MARKERS, apply_style, finalize_axis, save_fig, AVERAGE_LINE_WIDTH, marker_size, scatter_size

REPO_ROOT = Path(__file__).resolve().parents[2]
WEIGHTS_CSV = REPO_ROOT / "analysis/prefelic_refit/weights_final.csv"
H2A_CSV = REPO_ROOT / "analysis/A2A_analysis/prolific/features_prolific.csv"
A2A_CSV = REPO_ROOT / "analysis/A2A_analysis/a2a/features_a2a.csv"
FIGS = Path(__file__).resolve().parents[1] / "figs" / "no_f8"
FIGS.mkdir(parents=True, exist_ok=True)

DROPPED_FEATURE = "f8_aspect"

DRIVER_MODEL_CONDITION = {
    "google/gemini-3-flash-preview": "gemini",
    "qwen/qwen2.5-vl-72b-instruct": "qwen",
}

BASE_CONDITIONS = [
    ("human", COLORS["human"]),
    ("claude_uncapped", COLORS["claude"]),
    ("gemini", COLORS["gemini"]),
    ("qwen", COLORS["qwen"]),
]


def load_weights_no_f8():
    """Returns (feature_names, weight_vector, max_score) for the composite
    score with f8_aspect removed — raw coefficients, sum-of-weights
    normalization, identical convention to data.py's _weight_vector() minus
    one term."""
    wdf = pd.read_csv(WEIGHTS_CSV)
    wdf = wdf[wdf["feature"] != DROPPED_FEATURE]
    geo = wdf["feature"].tolist()
    wvec = wdf["coef_raw"].to_numpy()
    max_score = float(wvec.sum())
    return geo, wvec, max_score


def score_no_f8(df, geo, wvec, max_score):
    return (df[geo].to_numpy(dtype=float) @ wvec) / max_score


def load_h2a(geo, wvec, max_score):
    d = pd.read_csv(H2A_CSV)
    d["score_no_f8"] = score_no_f8(d, geo, wvec, max_score)
    qualifying = d.loc[d["k"] >= 2, "conversation_id"].unique()
    d = d[d["conversation_id"].isin(qualifying)].copy()
    d["condition"] = "human"
    return d[["condition", "conversation_id", "turn", "score_no_f8"]]


def load_a2a_base(geo, wvec, max_score):
    d = pd.read_csv(A2A_CSV)
    d["score_no_f8"] = score_no_f8(d, geo, wvec, max_score)
    qualifying = d.loc[d["k"] >= 2, "conversation_id"].unique()
    d = d[d["conversation_id"].isin(qualifying)].copy()

    def cond_of(row):
        if row["driver_model"] == "anthropic/claude-opus-5" and row["run_index"] < 8:
            return "claude_uncapped"
        return DRIVER_MODEL_CONDITION.get(row["driver_model"])

    d["condition"] = d.apply(cond_of, axis=1)
    d = d[d["condition"].notna()]
    return d[["condition", "conversation_id", "turn", "score_no_f8"]]


def main():
    apply_style()
    geo, wvec, max_score = load_weights_no_f8()
    print(f"no-f8 feature set: {geo}")
    print(f"no-f8 raw weights: {wvec.tolist()}")
    print(f"no-f8 max_score (sum of weights): {max_score:.4f}")

    d = pd.concat([load_h2a(geo, wvec, max_score), load_a2a_base(geo, wvec, max_score)], ignore_index=True)

    max_turn = int(d["turn"].max())
    fig, ax = plt.subplots(figsize=(11, 6))
    for cond_key, color in BASE_CONDITIONS:
        dc = d[d["condition"] == cond_key]
        if dc.empty:
            continue
        n = dc["conversation_id"].nunique()
        marker = MARKERS[cond_key]
        ax.scatter(dc["turn"], dc["score_no_f8"], color=color, marker=marker,
                   s=scatter_size(marker, 26), alpha=0.22, zorder=1, linewidths=0)
        avg = dc.groupby("turn")["score_no_f8"].mean()
        ax.plot(avg.index, avg.to_numpy(), color=color, linewidth=AVERAGE_LINE_WIDTH,
                marker=marker, markersize=marker_size(marker), zorder=3,
                label=f"{LABELS[cond_key.replace('claude_uncapped', 'claude')]} (n = {n})")

    ax.set_xlim(0, max_turn + 0.5)
    ax.set_xticks(range(0, max_turn + 1))
    ax.set_ylim(0, 1.05)

    finalize_axis(
        ax, title="Closeness to Target, f8 (Aspect-Ratio Match) Removed",
        xlabel="Turn number", ylabel="Match-to-target score (no f8_aspect)",
        subtitle=f"f8 (aspect-ratio match) excluded, remaining 4 weights renormalized. Uncapped to turn {max_turn}.",
    )
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=4)
    save_fig(fig, FIGS / "trend_no_f8_base_conditions.png")


if __name__ == "__main__":
    main()
