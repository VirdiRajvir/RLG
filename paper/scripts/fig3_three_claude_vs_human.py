"""
Figure: the human study compared against three versions of Claude, one
speaking freely, one limited to a short instruction each turn, and one
with its extended thinking turned off.

  python3.10 paper/scripts/fig3_three_claude_vs_human.py
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all
from style import COLORS, MARKERS, apply_style, finalize_axis, save_fig, AVERAGE_LINE_WIDTH, INDIVIDUAL_LINE_WIDTH, INDIVIDUAL_ALPHA, marker_size, scatter_size

FIGS = Path(__file__).resolve().parents[1] / "figs"
TURN_CAP = 8

CLAUDE_SHADES = {
    "claude_uncapped": "#D97757",
    "claude_capped": "#F0A97A",
    "claude_no_thinking": "#8C4A2F",
}
CONDITIONS = [
    ("human", "Human", COLORS["human"]),
    ("claude_uncapped", "Claude, speaking freely", CLAUDE_SHADES["claude_uncapped"]),
    ("claude_capped", "Claude, short instructions only", CLAUDE_SHADES["claude_capped"]),
    ("claude_no_thinking", "Claude, thinking turned off", CLAUDE_SHADES["claude_no_thinking"]),
]

def anchored(xs, ys):
    return np.concatenate([[0], xs]), np.concatenate([[0], ys])

def main():
    apply_style()
    d = load_all()
    d = d[d["turn"] <= TURN_CAP].copy()

    fig, ax = plt.subplots(figsize=(11, 5.5))

    for cond_key, label, color in CONDITIONS:
        dc = d[d["condition"] == cond_key]
        ax.scatter(dc["turn"], dc["score"], color=color, marker=MARKERS[cond_key],
                    s=scatter_size(MARKERS[cond_key], 32), alpha=INDIVIDUAL_ALPHA, zorder=1, linewidths=0)
        avg = dc.groupby("turn")["score"].mean()
        avg_x, avg_y = anchored(avg.index.to_numpy(), avg.to_numpy())
        n_sessions = dc["conversation_id"].nunique()
        ax.plot(avg_x, avg_y, color=color, linewidth=AVERAGE_LINE_WIDTH,
                 marker=MARKERS[cond_key], markersize=marker_size(MARKERS[cond_key]), markevery=slice(1, None), zorder=3,
                 label=f"{label} (n = {n_sessions})")

    finalize_axis(
        ax,
        title="Claude's Match to Target, With and Without Constraints",
        xlabel="Turn number",
        ylabel="Match to target, from 0 to 1",
        subtitle="Faint dots show individual sessions. Bold lines show the average for each condition.",
    )
    ax.set_xlim(0, TURN_CAP + 0.4)
    ax.set_ylim(0, 1.02)
    ax.set_xticks(range(0, TURN_CAP + 1))
    ax.legend(loc="lower right", frameon=False)

    save_fig(fig, FIGS / "fig3_three_claude_vs_human.png")

if __name__ == "__main__":
    main()
