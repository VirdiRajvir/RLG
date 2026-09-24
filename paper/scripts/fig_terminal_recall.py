"""
Checks whether f1_recall's apparent human deficit (see
fig_feature_breakdown.py) is real or an artifact of comparing "recall at
turn N" across sessions of very different lengths — a human session that
runs 17 turns is still mid-build at turn 8, while a Claude session that
stops at turn 4 is already done. Grouping by fixed turn number understates
how far a long-running human session eventually gets.

This takes, per session, ONLY its terminal turn (the last turn recorded for
that conversation_id — i.e. wherever that specific session actually ended,
regardless of turn count) and plots mean f1_recall at termination, per
condition. This is the fair comparison: "how much of the target did you
have by the time you were done," not "how much did you have at a turn
number some sessions never reached in a meaningful way."

  python3.10 paper/scripts/fig_terminal_recall.py
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all_with_features
from style import ALL_CONDITIONS, apply_style, finalize_axis, save_fig

FIGS = Path(__file__).resolve().parents[1] / "figs"


def main():
    apply_style()
    d = load_all_with_features()

    # terminal turn per session: the row with the max turn for each conversation_id
    last_idx = d.groupby("conversation_id")["turn"].idxmax()
    terminal = d.loc[last_idx]

    fig, ax = plt.subplots(figsize=(13, 6))
    ax.axhline(1.0, color="#999999", linewidth=1.2, linestyle="--", zorder=0)
    ax.text(len(ALL_CONDITIONS) - 0.6, 1.015, "optimum", ha="right", va="bottom",
             fontsize=10, color="#777777")

    rng = np.random.default_rng(0)
    labels_x = []
    for i, (cond_key, label, color) in enumerate(ALL_CONDITIONS):
        vals = terminal.loc[terminal["condition"] == cond_key, "f1_recall"]
        if vals.empty:
            labels_x.append(f"{label}\n(n = 0)")
            continue
        mean = vals.mean()
        sem = vals.sem() if len(vals) > 1 else 0
        ax.bar(i, mean, yerr=sem, capsize=6, color=color, alpha=0.8, width=0.6,
               error_kw={"ecolor": "#333333", "linewidth": 1.6, "zorder": 4}, zorder=2)
        jitter = rng.uniform(-0.16, 0.16, size=len(vals))
        ax.scatter(np.full(len(vals), i) + jitter, vals, color=color, s=22,
                   alpha=0.6, zorder=3, linewidths=0.6, edgecolors="white")
        labels_x.append(f"{label}\n(n = {len(vals)})")

    ax.set_xticks(range(len(ALL_CONDITIONS)))
    ax.set_xticklabels(labels_x, rotation=22, ha="right", fontsize=10)
    ax.set_ylim(0, 1.1)

    finalize_axis(
        ax, title="Recall at Session's Terminal Turn, by Condition",
        xlabel="Condition", ylabel="f1_recall (fraction of target boxes recreated), at the last turn",
        subtitle="Bars: mean recall at the LAST turn of each session (wherever it actually ended, "
                 "not a fixed turn number). Dots: individual sessions. Error bars: standard error.",
    )
    save_fig(fig, FIGS / "terminal_recall_by_condition.png")


if __name__ == "__main__":
    main()
