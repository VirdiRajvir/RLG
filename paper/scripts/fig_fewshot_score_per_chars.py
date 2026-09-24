"""
Two "match to target per character typed" curves (same metric as
fig4a_score_per_cumulative_characters.png) for the human-style few-shot
ablation (claude_human_style, run_index 14-15):

  1) score_per_cumulative_chars_claude_levels.png - human plus all 5 Claude
     conditions, no Gemini/Qwen.
  2) score_per_cumulative_chars_all_conditions.png - every condition in the
     paper (human + 5 Claude levels + Gemini + Qwen).

  python3.10 paper/scripts/fig_fewshot_score_per_chars.py
"""
import sys
from pathlib import Path
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all
from style import (CLAUDE_LEVELS_AND_HUMAN, ALL_CONDITIONS, MARKERS, apply_style,
                    finalize_axis, save_fig, AVERAGE_LINE_WIDTH, marker_size, scatter_size)

FIGS = Path(__file__).resolve().parents[1] / "figs" / "lessnums_claude"
FIGS.mkdir(parents=True, exist_ok=True)


def prep(d):
    d = d[d["chars_prompt"] > 0].copy()
    d = d.sort_values(["conversation_id", "turn"])
    d["cum_chars"] = d.groupby("conversation_id")["chars_prompt"].cumsum()
    d["r_cum"] = d["score"] / d["cum_chars"]
    return d


def make_chart(d, conditions, out_name):
    keys = [c for c, _, _ in conditions]
    max_turn = int(d.loc[d["condition"].isin(keys), "turn"].max())

    fig, ax = plt.subplots(figsize=(11, 5.5))
    for cond_key, label, color in conditions:
        dc = d[d["condition"] == cond_key]
        if dc.empty:
            continue
        ax.scatter(dc["turn"], dc["r_cum"], color=color, marker=MARKERS[cond_key],
                    s=scatter_size(MARKERS[cond_key], 28), alpha=0.24, zorder=1, linewidths=0)
        avg = dc.groupby("turn")["r_cum"].mean()
        n = dc["conversation_id"].nunique()
        ax.plot(avg.index, avg.to_numpy(), color=color, linewidth=AVERAGE_LINE_WIDTH,
                 marker=MARKERS[cond_key], markersize=marker_size(MARKERS[cond_key]), zorder=3, label=f"{label} (n = {n})")

    finalize_axis(
        ax, title="Match to Target per Character Typed",
        xlabel="Turn number", ylabel="Match to target / total characters typed so far",
        subtitle="Dots show individual turns. Bold lines show the average for each condition. "
                 "Uncapped — runs to the longest session in this comparison.",
    )
    ax.set_xlim(0, max_turn + 0.5)
    ax.set_xticks(range(0, max_turn + 1))
    ax.set_ylim(0, 0.005)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=3)
    save_fig(fig, FIGS / out_name)


def main():
    apply_style()
    d = prep(load_all())
    make_chart(d, CLAUDE_LEVELS_AND_HUMAN, "score_per_cumulative_chars_claude_levels.png")
    make_chart(d, ALL_CONDITIONS, "score_per_cumulative_chars_all_conditions.png")


if __name__ == "__main__":
    main()
