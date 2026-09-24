"""
Score improvement by instruction type (same metric/method as
fig6c_score_gain_by_category.png in fig6_prompt_type_analysis.py), pooled
over human plus all 5 Claude conditions for the human-style few-shot
ablation comparison — no Gemini/Qwen.

  python3.10 paper/scripts/fig_fewshot_score_gain_by_category.py
"""
import sys
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from style import CLAUDE_LEVELS_AND_HUMAN, apply_style, finalize_axis, save_fig
from fig6_prompt_type_analysis import load_merged, CATS, CAT_LABELS, CAT_COLORS

FIGS = Path(__file__).resolve().parents[1] / "figs" / "lessnums_claude"
FIGS.mkdir(parents=True, exist_ok=True)

CLAUDE_LEVEL_KEYS = [key for key, _, _ in CLAUDE_LEVELS_AND_HUMAN]


def main():
    apply_style()
    d = load_merged()
    d = d[d["condition"].isin(CLAUDE_LEVEL_KEYS)]

    fig, ax = plt.subplots(figsize=(9, 5.5))
    groups = [d.loc[d[cat] == 1, "gain"] for cat in CATS]
    means = [g.mean() for g in groups]
    sems = [g.sem() for g in groups]

    y_min = min(0, min(g.min() for g in groups))
    y_max = max(g.max() for g in groups)
    pad = 0.06 * (y_max - y_min)
    ax.axhspan(y_min - pad, 0, color="#D64545", alpha=0.08, zorder=0)

    ax.bar(range(len(CATS)), means, yerr=sems, capsize=6,
           color=[CAT_COLORS[c] for c in CATS], alpha=0.55,
           error_kw={"ecolor": "#333333", "linewidth": 1.6, "zorder": 4}, zorder=2)

    rng = np.random.default_rng(0)
    for i, cat in enumerate(CATS):
        vals = groups[i]
        jitter = rng.uniform(-0.16, 0.16, size=len(vals))
        ax.scatter(i + jitter, vals, color=CAT_COLORS[cat], s=18, alpha=0.55,
                   zorder=3, linewidths=0.6, edgecolors="white")

    ax.set_xticks(range(len(CATS)))
    ax.set_xticklabels([f"{CAT_LABELS[cat]}\n(n = {int(d[cat].sum())})" for cat in CATS])
    ax.axhline(0, color="#333333", linewidth=1, zorder=1)
    ax.set_ylim(y_min - pad, y_max + pad)

    finalize_axis(
        ax, title="Score Improvement by Instruction Type, Claude Levels",
        xlabel="Instruction type", ylabel="Increase in match to target on that turn",
        subtitle="Bars show the average change in score (error bars: standard error); dots are individual turns.",
    )
    save_fig(fig, FIGS / "score_gain_by_category_claude_levels.png")


if __name__ == "__main__":
    main()
