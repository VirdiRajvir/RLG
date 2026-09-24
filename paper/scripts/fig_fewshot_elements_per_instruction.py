"""
Elements referenced per instruction (same metric/method as
fig7_elements_per_instruction.png in element_count_analysis.py), scoped to
human plus all 5 Claude conditions for the human-style few-shot ablation
comparison — no Gemini/Qwen.

  python3.10 paper/scripts/fig_fewshot_elements_per_instruction.py
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from style import CLAUDE_LEVELS_AND_HUMAN, apply_style, finalize_axis, save_fig
from element_count_analysis import count_elements

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
FIGS = Path(__file__).resolve().parents[1] / "figs" / "lessnums_claude"
FIGS.mkdir(parents=True, exist_ok=True)


def main():
    apply_style()
    df = pd.read_csv(DATA_DIR / "prompt_classifications.csv")
    counts = df["text"].apply(count_elements)
    df["elements_expanded"] = [c[1] for c in counts]

    fig, ax = plt.subplots(figsize=(13, 6))
    groups, labels_x, colors = [], [], []
    for key, label, color in CLAUDE_LEVELS_AND_HUMAN:
        vals = df.loc[df["condition"] == key, "elements_expanded"]
        if len(vals) == 0:
            print(f"[note] no data for {key} — skipping")
            continue
        groups.append(vals)
        labels_x.append(f"{label}\n(n = {len(vals)})")
        colors.append(color)

    bp = ax.boxplot(groups, positions=range(len(groups)), widths=0.5, patch_artist=True, showfliers=False,
                     medianprops={"color": "#111111", "linewidth": 2})
    for patch, c in zip(bp["boxes"], colors):
        patch.set_facecolor(c)
        patch.set_alpha(0.35)
        patch.set_edgecolor(c)

    rng = np.random.default_rng(0)
    for i, vals in enumerate(groups):
        jitter = rng.uniform(-0.16, 0.16, size=len(vals))
        ax.scatter(i + jitter, vals, color=colors[i], s=18, alpha=0.5, zorder=3, linewidths=0)

    ax.set_xticks(range(len(groups)))
    ax.set_xticklabels(labels_x, fontsize=10.5, rotation=18, ha="right")
    finalize_axis(
        ax, title="Elements Referenced per Instruction, Claude Levels",
        xlabel="Speaker / condition", ylabel="Distinct box-N / container-N elements referenced",
        subtitle='Counts explicit labels plus "box-A through box-B" ranges; box shows the middle 50% (outliers hidden).',
    )
    save_fig(fig, FIGS / "elements_per_instruction_claude_levels.png")


if __name__ == "__main__":
    main()
