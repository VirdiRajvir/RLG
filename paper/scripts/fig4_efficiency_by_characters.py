"""
Two figures showing how much page-matching quality each speaker gets out
of the characters it types, using character counts instead of word counts
so every speaker (including the AI models with very different phrasing
styles) is measured on the same, simple scale.

  1) Match to target divided by the total characters typed so far.
  2) The gain in match to target from one turn to the next, divided by the
     characters typed on that turn.

  python3.10 paper/scripts/fig4_efficiency_by_characters.py
"""
import sys
from pathlib import Path
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all
from style import ALL_SIX, MARKERS, apply_style, finalize_axis, save_fig, AVERAGE_LINE_WIDTH, marker_size, scatter_size

FIGS = Path(__file__).resolve().parents[1] / "figs"

# fig4a (score per character) is scoped to unrestricted Claude only, dropping
# the capped/no-thinking ablation variants — those belong with the other
# Claude-conditions figures, not this one, which is meant as the core
# human/Claude/Gemini/Qwen efficiency comparison (matches fig1's 4 series).
BASE_FOUR = [c for c in ALL_SIX if c[0] in ("human", "claude_uncapped", "gemini", "qwen")]

def prep(d):
    d = d[d["chars_prompt"] > 0].copy()
    d = d.sort_values(["conversation_id", "turn"])
    d["cum_chars"] = d.groupby("conversation_id")["chars_prompt"].cumsum()
    d["prev_score"] = d.groupby("conversation_id")["score"].shift(1).fillna(0.0)
    d["gain"] = d["score"] - d["prev_score"]
    d["r_cum"] = d["score"] / d["cum_chars"]
    d["r_gain"] = d["gain"] / d["chars_prompt"]
    return d

def make_chart(d, y_col, title, ylabel, out_name, shade_negative=False, turn_cap=None, ylim=None, conditions=ALL_SIX):
    if turn_cap is not None:
        d = d[d["turn"] <= turn_cap]

    fig, ax = plt.subplots(figsize=(11, 5.5))
    if shade_negative:
        y_min = min(d[y_col].min(), 0)
        ax.axhspan(y_min * 1.1, 0, color="#D64545", alpha=0.08, zorder=0)
    for cond_key, label, color in conditions:
        dc = d[d["condition"] == cond_key]
        if dc.empty:
            continue
        ax.scatter(dc["turn"], dc[y_col], color=color, marker=MARKERS[cond_key],
                    s=scatter_size(MARKERS[cond_key], 28), alpha=0.24, zorder=1, linewidths=0)
        avg = dc.groupby("turn")[y_col].mean()
        n = dc["conversation_id"].nunique()
        ax.plot(avg.index, avg.to_numpy(), color=color, linewidth=AVERAGE_LINE_WIDTH,
                 marker=MARKERS[cond_key], markersize=marker_size(MARKERS[cond_key]), zorder=3, label=f"{label} (n = {n})")

    finalize_axis(
        ax, title=title, xlabel="Turn number", ylabel=ylabel,
        subtitle="Dots show individual turns. Bold lines show the average for each condition.",
    )
    turn_max = turn_cap if turn_cap is not None else d["turn"].max()
    ax.set_xlim(0, turn_max + 0.5)
    if turn_cap is not None:
        ax.set_xticks(range(0, turn_cap + 1))
    if ylim is not None:
        # A handful of turn-1 outlier dots (large score over a tiny character
        # count) sit far above where every average line lives — left
        # unclipped, they force the axis tall enough to flatten turns 2-8
        # into a thin band where the six close-together lines are hard to
        # tell apart. Capping the axis here trades those few outlier dots
        # (clipped at the top edge) for a much taller, more legible view of
        # where the actual condition differences are.
        ax.set_ylim(*ylim)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=3)
    save_fig(fig, FIGS / out_name)

def main():
    apply_style()
    d = prep(load_all())
    make_chart(
        d, "r_cum",
        "Match to Target per Character Typed",
        "Match to target / total characters typed so far",
        "fig4a_score_per_cumulative_characters.png",
        turn_cap=8, ylim=(0, 0.005), conditions=BASE_FOUR,
    )
    make_chart(
        d, "r_gain",
        "Improvement in Match to Target per Character Typed",
        "Increase in match to target / characters typed this turn",
        "fig4b_gain_per_character.png",
        shade_negative=True,
    )

if __name__ == "__main__":
    main()
