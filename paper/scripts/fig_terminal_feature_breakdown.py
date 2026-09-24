"""
Same 4 features as fig_feature_breakdown.py (f1_recall, f8_aspect,
f9_order_consistency, f14_section_uniformity), but instead of grouping by a
fixed turn number, each session contributes only its TERMINAL turn — the
last turn actually recorded for that conversation_id, wherever that
session happened to end. Fixed-turn comparison understates long-running
sessions (a human session still at turn 8 of 17 looks artificially behind
a Claude session that finished at turn 4) — see fig_terminal_recall.py,
which established this for f1_recall alone; this extends the same fix to
all 4 features in one 2x2 figure.

2x2 grid, one panel per feature. Each panel: one bar per condition (mean
terminal-turn value + SEM error bar + individual session dots), dashed
line at each feature's own optimum (1.0).

  python3.10 paper/scripts/fig_terminal_feature_breakdown.py
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all_with_features, BREAKDOWN_FEATURES
from style import ALL_CONDITIONS, apply_style

FIGS = Path(__file__).resolve().parents[1] / "figs"

FEATURE_LABELS = {
    "f1_recall": "Recall\n(fraction of target boxes recreated)",
    "f8_aspect": "Aspect ratio match\n(matched boxes)",
    "f9_order_consistency": "Reading-order consistency",
    "f14_section_uniformity": "Section recall uniformity",
}


def main():
    apply_style()
    d = load_all_with_features()

    # terminal turn per session: the row with the max turn for each conversation_id
    last_idx = d.groupby("conversation_id")["turn"].idxmax()
    terminal = d.loc[last_idx]

    fig, axes = plt.subplots(2, 2, figsize=(17, 12))
    rng = np.random.default_rng(0)

    for feat, ax in zip(BREAKDOWN_FEATURES, axes.flat):
        ax.axhline(1.0, color="#999999", linewidth=1.2, linestyle="--", zorder=0)
        ax.text(len(ALL_CONDITIONS) - 0.6, 1.015, "optimum", ha="right", va="bottom",
                 fontsize=10, color="#777777")

        labels_x = []
        for i, (cond_key, label, color) in enumerate(ALL_CONDITIONS):
            vals = terminal.loc[terminal["condition"] == cond_key, feat]
            if vals.empty:
                labels_x.append(f"{label}\n(n = 0)")
                continue
            mean = vals.mean()
            sem = vals.sem() if len(vals) > 1 else 0
            ax.bar(i, mean, yerr=sem, capsize=6, color=color, alpha=0.8, width=0.6,
                   error_kw={"ecolor": "#333333", "linewidth": 1.6, "zorder": 4}, zorder=2)
            jitter = rng.uniform(-0.16, 0.16, size=len(vals))
            ax.scatter(np.full(len(vals), i) + jitter, vals, color=color, s=18,
                       alpha=0.6, zorder=3, linewidths=0.6, edgecolors="white")
            labels_x.append(f"{label}\n(n = {len(vals)})")

        ax.set_title(FEATURE_LABELS[feat], fontsize=13.5, fontweight="bold", loc="left", pad=10)
        ax.set_xticks(range(len(ALL_CONDITIONS)))
        ax.set_xticklabels(labels_x, rotation=28, ha="right", fontsize=9.5)
        ax.set_ylabel("Feature value, 0 to 1")
        ax.set_ylim(0, 1.1)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(True, axis="y")

    fig.text(0.01, 0.995, "Bars: mean value at the LAST turn of each session (wherever it actually ended, "
              "not a fixed turn number). Dots: individual sessions. Error bars: standard error.",
              fontsize=11.5, color="#555555", ha="left", va="top")

    fig.tight_layout(rect=[0, 0, 1, 0.97])
    fig.savefig(FIGS / "terminal_feature_breakdown.png", dpi=300, bbox_inches="tight", pad_inches=0.25)
    print(f"saved {FIGS / 'terminal_feature_breakdown.png'}")


if __name__ == "__main__":
    main()
