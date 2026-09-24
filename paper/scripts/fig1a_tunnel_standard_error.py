"""
Variant of fig1_human_vs_ai_by_model.py: a tunnel (shaded band) per speaker
instead of dodged error bars — but the band is mean +/- 1 standard error,
not the full min-to-max range fig1 originally tried (that one was too wide
and the four bands overlapped into an illegible smear). SEM bands are tight
enough around each mean line to stay readable stacked on one shared axis.
No error bars, no individual-session dots — just the four tunnels and their
mean lines.

  python3.10 paper/scripts/fig1a_tunnel_standard_error.py
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

    for cond_key, label in CONDITIONS:
        dc = d[d["condition"] == cond_key]
        color = COLORS[COLOR_KEY[cond_key]]

        stats = dc.groupby("turn")["score"].agg(["mean", "sem"]).reindex(range(1, TURN_CAP + 1))
        sem = stats["sem"].fillna(0)
        n_sessions = dc["conversation_id"].nunique()

        band_x, band_lo = anchored(stats.index.to_numpy(), (stats["mean"] - sem).to_numpy())
        _, band_hi = anchored(stats.index.to_numpy(), (stats["mean"] + sem).to_numpy())
        ax.fill_between(band_x, band_lo, band_hi, color=color, alpha=0.20, zorder=1, linewidth=0)

        avg_x, avg_y = anchored(stats.index.to_numpy(), stats["mean"].to_numpy())
        ax.plot(avg_x, avg_y, color=color, linewidth=AVERAGE_LINE_WIDTH,
                 marker=MARKERS[cond_key], markersize=marker_size(MARKERS[cond_key]), markevery=slice(1, None), zorder=3,
                 label=f"{label} (n = {n_sessions})")

    finalize_axis(
        ax,
        title="Match to Target by Turn Number",
        xlabel="Turn number",
        ylabel="Match to target, from 0 to 1",
        subtitle="Shaded band is +-1 standard error across sessions. Bold lines show the average for each speaker.",
    )
    ax.set_xlim(0, TURN_CAP + 0.4)
    ax.set_ylim(0, 1.02)
    ax.set_xticks(range(0, TURN_CAP + 1))
    ax.legend(loc="lower right", frameon=False)

    save_fig(fig, FIGS / "fig1a_human_vs_ai_by_model_tunnel.png")


if __name__ == "__main__":
    main()
