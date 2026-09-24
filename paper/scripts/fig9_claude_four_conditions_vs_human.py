"""
Figure: the human study compared against four versions of Claude — speaking
freely, limited to a short instruction each turn, with its extended
thinking turned off, and (new) capped at 4 distinct box-N/container-N
elements per instruction. Same design as fig3_three_claude_vs_human.py,
extended with the fourth condition.

  python3.10 paper/scripts/fig9_claude_four_conditions_vs_human.py
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all
from style import COLORS, CLAUDE_SHADES, MARKERS, apply_style, finalize_axis, save_fig, AVERAGE_LINE_WIDTH, INDIVIDUAL_ALPHA, marker_size, scatter_size

FIGS = Path(__file__).resolve().parents[1] / "figs"
TURN_CAP = 8

CONDITIONS = [
    ("human", "Human", COLORS["human"]),
    ("claude_uncapped", "Claude, speaking freely", CLAUDE_SHADES["claude_uncapped"]),
    ("claude_capped", "Claude, short instructions only", CLAUDE_SHADES["claude_capped"]),
    ("claude_no_thinking", "Claude, thinking turned off", CLAUDE_SHADES["claude_no_thinking"]),
    ("claude_element_cap", "Claude, 4 elements per turn max", CLAUDE_SHADES["claude_element_cap"]),
]


def anchored(xs, ys):
    return np.concatenate([[0], xs]), np.concatenate([[0], ys])


def main():
    apply_style()
    d = load_all()
    d = d[d["turn"] <= TURN_CAP].copy()

    fig, ax = plt.subplots(figsize=(11, 5.5))

    missing = []
    for cond_key, label, color in CONDITIONS:
        dc = d[d["condition"] == cond_key]
        if dc.empty:
            missing.append(cond_key)
            continue
        ax.scatter(dc["turn"], dc["score"], color=color, marker=MARKERS[cond_key],
                    s=scatter_size(MARKERS[cond_key], 32), alpha=INDIVIDUAL_ALPHA, zorder=1, linewidths=0)
        avg = dc.groupby("turn")["score"].mean()
        avg_x, avg_y = anchored(avg.index.to_numpy(), avg.to_numpy())
        n_sessions = dc["conversation_id"].nunique()
        ax.plot(avg_x, avg_y, color=color, linewidth=AVERAGE_LINE_WIDTH,
                 marker=MARKERS[cond_key], markersize=marker_size(MARKERS[cond_key]), zorder=3,
                 label=f"{label} (n = {n_sessions})")

    if missing:
        print(f"[note] no data yet for: {', '.join(missing)} — plotted the rest")

    finalize_axis(
        ax,
        title="Claude's Match to Target, Across Four Constraints",
        xlabel="Turn number",
        ylabel="Match to target, from 0 to 1",
        subtitle="Faint dots show individual sessions. Bold lines show the average for each condition.",
    )
    ax.set_xlim(0, TURN_CAP + 0.4)
    ax.set_ylim(0, 1.02)
    ax.set_xticks(range(0, TURN_CAP + 1))
    ax.legend(loc="lower right", frameon=False)

    save_fig(fig, FIGS / "fig9_claude_four_conditions_vs_human.png")


if __name__ == "__main__":
    main()
