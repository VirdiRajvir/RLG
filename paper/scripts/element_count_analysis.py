"""
Counts how many distinct box-N / container-N elements each instruction
references (created, removed, or adjusted), by condition — the first step
toward the "elements per turn" ablation: capping how many elements Claude
may touch in a single turn, to test whether its efficiency comes from
batching many edits into one turn rather than genuinely better per-element
decisions. This script only measures the status quo (what counts humans and
the other AI models already use) so a sensible cap value can be picked
before that ablation is built; it does not run the ablation itself.

Counts distinct "box-N"/"container-N" labels via regex (elements_explicit),
plus a range heuristic for phrasing like "box-3 through box-7" — explicit-
label regex alone would undercount that as 2, not 5 (elements_expanded).
The expanded count is what the printed summary and figure use; both are
kept in the output CSV since the range heuristic is not perfect.

  python3.10 paper/scripts/element_count_analysis.py
"""
import re
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from style import apply_style, finalize_axis, save_fig

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
FIGS = Path(__file__).resolve().parents[1] / "figs"

LABEL_RE = re.compile(r'\b((?:box|container)-(\d+))\b', re.IGNORECASE)
RANGE_RE = re.compile(
    r'\b(box|container)-(\d+)\s*(?:through|to|-|–|—)\s*(?:box|container)?-?(\d+)\b',
    re.IGNORECASE,
)


def count_elements(text):
    text = text or ""
    explicit = {m.group(1).lower() for m in LABEL_RE.finditer(text)}
    expanded = set(explicit)
    for kind, a, b in RANGE_RE.findall(text):
        lo, hi = sorted((int(a), int(b)))
        if hi - lo <= 50:  # sanity cap against a runaway false-positive range
            expanded.update(f"{kind.lower()}-{i}" for i in range(lo, hi + 1))
    return len(explicit), len(expanded)


MODEL_PANELS = [("human", "Human"), ("claude_uncapped", "Claude (unrestricted)"),
                ("gemini", "Gemini"), ("qwen", "Qwen")]
PANEL_COLORS = {"human": "#111111", "claude_uncapped": "#D97757", "gemini": "#3B7DD8", "qwen": "#2FA35B"}


def main():
    apply_style()
    df = pd.read_csv(DATA_DIR / "prompt_classifications.csv")
    counts = df["text"].apply(count_elements)
    df["elements_explicit"] = [c[0] for c in counts]
    df["elements_expanded"] = [c[1] for c in counts]

    out_path = DATA_DIR / "element_counts.csv"
    df[["condition", "conversation_id", "turn", "elements_explicit", "elements_expanded", "text"]].to_csv(
        out_path, index=False)
    print(f"Wrote {out_path}\n")

    print("=== Elements referenced per instruction, by condition (expanded count) ===")
    print(f"{'condition':20s} {'n':>5} {'mean':>7} {'median':>7} {'p75':>6} {'p90':>6} {'p95':>6} {'max':>5}")
    for cond in sorted(df["condition"].unique()):
        vals = df.loc[df["condition"] == cond, "elements_expanded"]
        print(f"{cond:20s} {len(vals):5d} {vals.mean():7.2f} {vals.median():7.1f} "
              f"{vals.quantile(.75):6.1f} {vals.quantile(.9):6.1f} {vals.quantile(.95):6.1f} {vals.max():5d}")

    print("\n=== Same, pooled by speaker (human / Claude-unrestricted / Gemini / Qwen) ===")
    for key, label in MODEL_PANELS:
        vals = df.loc[df["condition"] == key, "elements_expanded"]
        if len(vals) == 0:
            continue
        print(f"{label:24s} n={len(vals):4d}  mean={vals.mean():5.2f}  median={vals.median():4.1f}  "
              f"p90={vals.quantile(.9):4.1f}  p95={vals.quantile(.95):4.1f}  max={vals.max()}")

    fig, ax = plt.subplots(figsize=(9, 5.5))
    groups, labels_x, colors = [], [], []
    for key, label in MODEL_PANELS:
        vals = df.loc[df["condition"] == key, "elements_expanded"]
        if len(vals) == 0:
            continue
        groups.append(vals)
        labels_x.append(f"{label}\n(n = {len(vals)})")
        colors.append(PANEL_COLORS[key])

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
    ax.set_xticklabels(labels_x)
    finalize_axis(
        ax, title="Elements Referenced per Instruction",
        xlabel="Speaker", ylabel="Distinct box-N / container-N elements referenced",
        subtitle='Counts explicit labels plus "box-A through box-B" ranges; box shows the middle 50% (outliers hidden).',
    )
    save_fig(fig, FIGS / "fig7_elements_per_instruction.png")


if __name__ == "__main__":
    main()
