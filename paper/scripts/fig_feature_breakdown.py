"""
Which specific feature(s) are humans not able to maximize, compared to
every AI condition? The composite score is a weighted sum of 5 features
(analysis/prefelic_refit/weights_final.csv), but one of those
(f7_rel_height) has a coefficient statistically indistinguishable from
zero — this figure breaks the other 4 out individually, each on its own
0-to-1 axis with a dashed line at 1.0 (the feature's own optimum, not a
regression artifact — see data.py's BREAKDOWN_FEATURES comment and
features-compute.js for why each of these 4 is natively 1.0-is-best in its
own raw formula regardless of the composite's regression weight sign).

  f1_recall              - fraction of target boxes actually recreated
  f8_aspect               - aspect-ratio match of matched boxes
  f9_order_consistency    - reading-order (top-to-bottom/left-to-right) preserved
  f14_section_uniformity  - recall consistency across sections/containers

2x2 grid, one panel per feature, grouped bars per turn number (all 9
conditions — human + 6 Claude levels + Gemini + Qwen — side by side within
each turn cluster), single shared legend below.

Capped at TURN_CAP=8 turns, unlike the line-chart versions elsewhere in
this project that were deliberately left uncapped — 9 conditions x 20+
turns as grouped bars would be an unreadable wall of slivers; 8 already
covers where every condition has multiple qualifying sessions.

  python3.10 paper/scripts/fig_feature_breakdown.py
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all_with_features, BREAKDOWN_FEATURES
from style import ALL_CONDITIONS, apply_style

FIGS = Path(__file__).resolve().parents[1] / "figs"
TURN_CAP = 8

FEATURE_LABELS = {
    "f1_recall": "Recall\n(fraction of target boxes recreated)",
    "f8_aspect": "Aspect ratio match\n(matched boxes)",
    "f9_order_consistency": "Reading-order consistency",
    "f14_section_uniformity": "Section recall uniformity",
}


def main():
    apply_style()
    d = load_all_with_features()
    d = d[d["turn"] <= TURN_CAP]

    n_cond = len(ALL_CONDITIONS)
    width = 0.85 / n_cond
    turns = np.arange(1, TURN_CAP + 1)

    fig, axes = plt.subplots(2, 2, figsize=(16, 11))
    handles_labels = None

    for feat, ax in zip(BREAKDOWN_FEATURES, axes.flat):
        ax.axhline(1.0, color="#999999", linewidth=1.2, linestyle="--", zorder=0)
        ax.text(TURN_CAP + 0.5, 1.015, "optimum", ha="right", va="bottom",
                 fontsize=10, color="#777777")

        for i, (cond_key, label, color) in enumerate(ALL_CONDITIONS):
            dc = d[d["condition"] == cond_key]
            n_sessions = dc["conversation_id"].nunique()
            avg = dc.groupby("turn")[feat].mean().reindex(turns)
            offset = (i - (n_cond - 1) / 2) * width
            ax.bar(turns + offset, avg.to_numpy(), width=width, color=color,
                   alpha=0.85, zorder=2, label=f"{label} (n = {n_sessions})")

        ax.set_title(FEATURE_LABELS[feat], fontsize=13.5, fontweight="bold", loc="left", pad=10)
        ax.set_xlabel("Turn number")
        ax.set_ylabel("Feature value, 0 to 1")
        ax.set_xlim(0.3, TURN_CAP + 0.9)
        ax.set_ylim(0, 1.08)
        ax.set_xticks(turns)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(True, axis="y")
        if handles_labels is None:
            handles_labels = ax.get_legend_handles_labels()

    fig.text(0.01, 0.995, "Bars show the average for each condition, by turn number (capped at turn 8 for "
              "legibility). Dashed line: each feature's own optimum (1.0), independent of the composite "
              "score's regression weight.",
              fontsize=11.5, color="#555555", ha="left", va="top")

    handles, labels = handles_labels
    fig.legend(handles, labels, loc="upper center", bbox_to_anchor=(0.5, -0.01), frameon=False, ncol=3, fontsize=11)
    fig.tight_layout(rect=[0, 0.05, 1, 0.97])
    fig.savefig(FIGS / "feature_breakdown_by_turn.png", dpi=300, bbox_inches="tight", pad_inches=0.25)
    print(f"saved {FIGS / 'feature_breakdown_by_turn.png'}")


if __name__ == "__main__":
    main()
