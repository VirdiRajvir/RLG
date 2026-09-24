"""
Figure: the counterfactual branch test, drawn as a simple block per
reference — no fork/arrow diagram. Each block is the reference target on
its own row, then three panels side by side underneath:

    Reference target
    Human at X | Claude at X+1 | Human at X+1

Human at X is the real state a human participant had reached at the branch
turn. Claude at X+1 is what Claude produced when handed that exact state for
one turn (never told the history was human's — see A2A/branch_test.py).
Human at X+1 is what the human's own next turn actually produced.

Reads A2A/branch_test.py's output: paper/data/branch_test_results.csv
and the screenshots in paper/data/branch_test/.

  python3.10 paper/scripts/fig10_branch_out_diagram.py
"""
import sys
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.gridspec import GridSpec

sys.path.insert(0, str(Path(__file__).resolve().parent))
from style import COLORS, apply_style

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SHOTS_DIR = DATA_DIR / "branch_test"
FIGS = Path(__file__).resolve().parents[1] / "figs"


def label_for(row):
    return f"{row['reference_name']}_{row['conversation_id'][:8]}_t{int(row['branch_turn'])}"


def show_image_or_placeholder(ax, path, placeholder_text, border_color=None):
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(True)
        spine.set_color(border_color or "#cccccc")
        spine.set_linewidth(2.5 if border_color else 1)
    if path and path.exists():
        ax.imshow(mpimg.imread(path))
    else:
        ax.set_facecolor("#f2f2f2")
        ax.text(0.5, 0.5, placeholder_text, ha="center", va="center", fontsize=10,
                 color="#888888", transform=ax.transAxes, wrap=True)


def fmt_score(x):
    return "n/a" if x is None or (isinstance(x, float) and pd.isna(x)) else f"{float(x):.2f}"


def main():
    apply_style()
    csv_path = DATA_DIR / "branch_test_results.csv"
    if not csv_path.exists():
        raise SystemExit(f"{csv_path} not found — run A2A/branch_test.py first.")
    df = pd.read_csv(csv_path)

    n = len(df)
    fig = plt.figure(figsize=(13, 7.4 * n))
    # Two grid rows per branch point: the reference target on its own row
    # (column 0 only), then the three-panel comparison row below it.
    gs = GridSpec(2 * n, 3, figure=fig, height_ratios=[1, 1] * n, hspace=0.16, wspace=0.08,
                  left=0.03, right=0.98, top=0.95, bottom=0.02)

    score_bbox = dict(facecolor="white", alpha=0.85, edgecolor="none", pad=2)

    for i, row in df.reset_index(drop=True).iterrows():
        label = label_for(row)
        r_ref, r_cmp = 2 * i, 2 * i + 1

        ax_ref = fig.add_subplot(gs[r_ref, 0])
        ax_before = fig.add_subplot(gs[r_cmp, 0])
        ax_claude = fig.add_subplot(gs[r_cmp, 1])
        ax_human = fig.add_subplot(gs[r_cmp, 2])

        show_image_or_placeholder(ax_ref, SHOTS_DIR / f"{label}_target.png", "target missing")
        show_image_or_placeholder(ax_before, SHOTS_DIR / f"{label}_before.png", "no prior attempt\n(turn 1)")
        show_image_or_placeholder(ax_claude, SHOTS_DIR / f"{label}_claude.png", "Claude chose to stop\n(no new turn)",
                                   border_color=COLORS["claude"])
        if row["is_last_turn"]:
            show_image_or_placeholder(ax_human, None,
                                       "human stopped\nhere — no real\nturn to compare\n(headroom test)")
        else:
            show_image_or_placeholder(ax_human, SHOTS_DIR / f"{label}_human_replay.png", "not generated",
                                       border_color=COLORS["human"])

        if i == 0:
            ax_ref.set_title("Reference target", fontsize=13, fontweight="bold")
            ax_before.set_title("Human at X", fontsize=13, fontweight="bold")
            ax_claude.set_title("Claude at X+1", fontsize=13, fontweight="bold", color=COLORS["claude"])
            ax_human.set_title("Human at X+1", fontsize=13, fontweight="bold", color=COLORS["human"])

        ax_before.text(0.5, 0.02, f"match to target: {fmt_score(row['score_at_branch_turn'])}",
                        transform=ax_before.transAxes, ha="center", va="bottom", fontsize=9.5,
                        color="#555555", bbox=score_bbox)
        ax_claude.text(0.5, 0.02, f"match to target: {fmt_score(row['claude_score'])}",
                        transform=ax_claude.transAxes, ha="center", va="bottom", fontsize=9.5,
                        color=COLORS["claude"], bbox=score_bbox)
        if not row["is_last_turn"]:
            ax_human.text(0.5, 0.02, f"match to target: {fmt_score(row['human_replay_score'])}",
                           transform=ax_human.transAxes, ha="center", va="bottom", fontsize=9.5,
                           color=COLORS["human"], bbox=score_bbox)

    fig.text(0.5, 0.975,
              "Claude is handed the exact same instruction history, target, and current attempt a human faced "
              "at that turn — never told the history is human's — and asked for one instruction.",
              fontsize=11.5, color="#555555", ha="center")

    out_path = FIGS / "fig10_branch_out_diagram.png"
    fig.savefig(out_path, dpi=300, pad_inches=0.25)  # no tight_layout: it would move axes
    print(f"saved {out_path}")


if __name__ == "__main__":
    main()
