"""
Figure: how closely the generated page matches the target, turn by turn,
comparing the human study against each AI model driving on its own
(default settings, no constraints applied).

  python3.10 paper/scripts/fig1_human_vs_ai_by_model.py
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all
from style import COLORS, MARKERS, apply_style, finalize_axis, save_fig, AVERAGE_LINE_WIDTH, marker_size

FIGS = Path(__file__).resolve().parents[1] / "figs"
TURN_CAP = 8

CONDITIONS = [
    ("human", "Human"),
    ("claude_uncapped", "Claude"),
    ("gemini", "Gemini"),
    ("qwen", "Qwen"),
]
COLOR_KEY = {"human": "human", "claude_uncapped": "claude", "gemini": "gemini", "qwen": "qwen"}

def anchored(xs, ys):
    return np.concatenate([[0], xs]), np.concatenate([[0], ys])

def main():
    apply_style()
    d = load_all()
    d = d[d["turn"] <= TURN_CAP].copy()

    fig, ax = plt.subplots(figsize=(11, 5.5))

    # Dodge: nudge each condition's points a little left/right of the actual
    # turn so 4 error bars at the same turn don't sit on top of each other.
    n_cond = len(CONDITIONS)
    dodge_width = 0.28
    offsets = np.linspace(-dodge_width / 2, dodge_width / 2, n_cond)

    for (cond_key, label), dx in zip(CONDITIONS, offsets):
        dc = d[d["condition"] == cond_key]
        color = COLORS[COLOR_KEY[cond_key]]

        stats = dc.groupby("turn")["score"].agg(["mean", "sem"]).reindex(range(1, TURN_CAP + 1))
        n_sessions = dc["conversation_id"].nunique()

        # Dodge the line itself too, not just the error bars — otherwise the
        # line runs through integer turns while its own markers sit offset
        # from it, which reads as a mismatch rather than one series.
        dodged_x = stats.index.to_numpy() + dx
        avg_x, avg_y = anchored(dodged_x, stats["mean"].to_numpy())
        ax.plot(avg_x, avg_y, color=color, linewidth=AVERAGE_LINE_WIDTH,
                 marker=MARKERS[cond_key], markersize=marker_size(MARKERS[cond_key]), markevery=slice(1, None),
                 zorder=2, label=f"{label} (n = {n_sessions})")
        ax.errorbar(dodged_x, stats["mean"], yerr=stats["sem"].fillna(0),
                     fmt="none", ecolor=color, elinewidth=1.6,
                     capsize=3, capthick=1.6, zorder=3)

    finalize_axis(
        ax,
        title="Match to Target by Turn Number",
        xlabel="Turn number",
        ylabel="Match to target, from 0 to 1",
        subtitle="Points show the average for each speaker; error bars are ±1 standard error across sessions.",
    )
    ax.set_xlim(0, TURN_CAP + 0.4)
    ax.set_ylim(0, 1.02)
    ax.set_xticks(range(0, TURN_CAP + 1))
    ax.legend(loc="lower right", frameon=False)

    save_fig(fig, FIGS / "fig1_human_vs_ai_by_model.png")

if __name__ == "__main__":
    main()
