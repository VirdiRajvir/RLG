"""
Figure: how much page code comes out for every character of instruction
that goes in, turn by turn. This is the same idea as comparing output
length to input length, but measured in characters for both sides so it
is directly comparable across every speaker.

  python3.10 paper/scripts/fig5_output_size_vs_instruction_size.py
"""
import sys
from pathlib import Path
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all
from style import ALL_SIX, MARKERS, apply_style, finalize_axis, save_fig, AVERAGE_LINE_WIDTH, marker_size, scatter_size

FIGS = Path(__file__).resolve().parents[1] / "figs"
TURN_CAP = 8

def main():
    apply_style()
    d = load_all()
    d = d[(d["chars_prompt"] > 0) & (d["chars_html"] != "")].copy()
    d["chars_html"] = d["chars_html"].astype(float)
    d["ratio"] = d["chars_html"] / d["chars_prompt"]
    d = d[d["turn"] <= TURN_CAP].copy()

    fig, ax = plt.subplots(figsize=(11, 5.8))
    for cond_key, label, color in ALL_SIX:
        dc = d[d["condition"] == cond_key]
        if dc.empty:
            continue
        ax.scatter(dc["turn"], dc["ratio"], color=color, marker=MARKERS[cond_key],
                    s=scatter_size(MARKERS[cond_key], 28), alpha=0.22, zorder=1, linewidths=0)
        avg = dc.groupby("turn")["ratio"].mean()
        n = dc["conversation_id"].nunique()
        ax.plot(avg.index, avg.to_numpy(), color=color, linewidth=AVERAGE_LINE_WIDTH,
                 marker=MARKERS[cond_key], markersize=marker_size(MARKERS[cond_key]), zorder=3, label=f"{label} (n = {n})")

    finalize_axis(
        ax,
        title="Page Code Generated per Character of Instruction",
        xlabel="Turn number",
        ylabel="Characters of page code / characters of instruction",
        subtitle="Dots show individual turns. Bold lines show the average for each condition.",
    )
    ax.set_xlim(0, TURN_CAP + 0.5)
    ax.set_xticks(range(0, TURN_CAP + 1))
    ax.set_yscale("log")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=3)
    save_fig(fig, FIGS / "fig5_output_size_vs_instruction_size.png")

if __name__ == "__main__":
    main()
