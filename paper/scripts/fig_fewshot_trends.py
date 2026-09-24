"""
Two trend curves (score by turn) for the human-style few-shot ablation
(claude_human_style, run_index 14-15 — Claude Opus 5 given real human
instructions as a style guide, otherwise fully unrestricted):

  1) trend_claude_levels_vs_human.png - human plus all 5 Claude conditions
     (uncapped/capped/no_thinking/element_cap/human_style), no Gemini/Qwen.
     Same shape as fig9_claude_four_conditions_vs_human.py, extended with
     the fifth condition.
  2) trend_all_conditions.png - every condition in the paper on one axis
     (human + 5 Claude levels + Gemini + Qwen). Same shape as
     fig8_all_conditions_h2a_vs_a2a.py, extended with the fifth Claude
     condition.

  python3.10 paper/scripts/fig_fewshot_trends.py
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all
from style import (CLAUDE_LEVELS_AND_HUMAN, ALL_CONDITIONS, MARKERS, apply_style,
                    finalize_axis, save_fig, AVERAGE_LINE_WIDTH, INDIVIDUAL_ALPHA,
                    marker_size, scatter_size)

FIGS = Path(__file__).resolve().parents[1] / "figs" / "lessnums_claude"
FIGS.mkdir(parents=True, exist_ok=True)


def anchored(xs, ys):
    return np.concatenate([[0], xs]), np.concatenate([[0], ys])


def plot_trend(d, conditions, out_name, figsize, legend_kwargs):
    keys = [c for c, _, _ in conditions]
    max_turn = int(d.loc[d["condition"].isin(keys), "turn"].max())

    fig, ax = plt.subplots(figsize=figsize)
    missing = []
    for cond_key, label, color in conditions:
        dc = d[d["condition"] == cond_key]
        if dc.empty:
            missing.append(cond_key)
            continue
        ax.scatter(dc["turn"], dc["score"], color=color, marker=MARKERS[cond_key],
                    s=scatter_size(MARKERS[cond_key], 28), alpha=INDIVIDUAL_ALPHA, zorder=1, linewidths=0)
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
        title="Match to Target by Turn Number",
        xlabel="Turn number",
        ylabel="Match to target, from 0 to 1",
        subtitle="Faint dots show individual sessions. Bold lines show the average for each condition. "
                 "Uncapped — runs to the longest session in this comparison.",
    )
    ax.set_xlim(0, max_turn + 0.4)
    ax.set_ylim(0, 1.02)
    ax.set_xticks(range(0, max_turn + 1))
    ax.legend(**legend_kwargs)
    save_fig(fig, FIGS / out_name)


def main():
    apply_style()
    d = load_all()

    plot_trend(d, CLAUDE_LEVELS_AND_HUMAN, "trend_claude_levels_vs_human.png",
               figsize=(11, 5.5), legend_kwargs=dict(loc="lower right", frameon=False))
    plot_trend(d, ALL_CONDITIONS, "trend_all_conditions.png",
               figsize=(12, 6.5),
               legend_kwargs=dict(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=3, fontsize=11))


if __name__ == "__main__":
    main()
