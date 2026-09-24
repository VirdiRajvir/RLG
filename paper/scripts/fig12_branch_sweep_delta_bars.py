"""
Bar chart from A2A/reference_branch_sweep.py's exhaustive one-turn-extension
data: at each human turn of a reference, how much did the match-to-target
score improve on the very next turn, for the human's own real next turn vs.
each of the three AI models' counterfactual one-turn extension from that
same branch point.

  x-axis: turn number (the branch point)
  y-axis: score at N+1 minus score at N (delta)
  bars:   Human, Claude, Gemini, Qwen

A turn/model with no bar means no data — either the human session ended
there (no real next turn), or that model chose to stop rather than propose
a new instruction.

Reads: paper/data/branch_sweep_<ref>.csv (see
A2A/reference_branch_sweep.py and fig11_branch_sweep_collage.py).

  python3.10 paper/scripts/fig12_branch_sweep_delta_bars.py
  python3.10 paper/scripts/fig12_branch_sweep_delta_bars.py --ref steel
"""
import argparse
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from style import COLORS, apply_style, finalize_axis, save_fig

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
FIGS = Path(__file__).resolve().parents[1] / "figs"

SERIES = [
    ("human", "Human", COLORS["human"], "score_human_next"),
    ("claude", "Claude", COLORS["claude"], "score_claude"),
    ("gemini", "Gemini", COLORS["gemini"], "score_gemini"),
    ("qwen", "Qwen", COLORS["qwen"], "score_qwen"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", type=str, default="darkminimal")
    args = ap.parse_args()
    ref_name = args.ref

    csv_path = DATA_DIR / f"branch_sweep_{ref_name}.csv"
    if not csv_path.exists():
        raise SystemExit(f"{csv_path} not found — run A2A/reference_branch_sweep.py --ref {ref_name} first.")
    df = pd.read_csv(csv_path)

    for _, _, _, col in SERIES:
        df[f"delta_{col}"] = df[col] - df["score_before"]

    apply_style()
    turns = sorted(df["turn"].unique())
    x = np.arange(len(turns))
    n_series = len(SERIES)
    width = 0.8 / n_series

    fig, ax = plt.subplots(figsize=(12, 5.5))

    all_deltas = pd.concat([df[f"delta_{col}"] for _, _, _, col in SERIES]).dropna()
    y_min = min(0, all_deltas.min())
    y_max = all_deltas.max()
    pad = 0.08 * (y_max - y_min)
    if y_min < 0:
        ax.axhspan(y_min - pad, 0, color="#D64545", alpha=0.08, zorder=0)

    for i, (key, label, color, col) in enumerate(SERIES):
        per_turn = df.groupby("turn")[f"delta_{col}"].mean()
        heights = [per_turn.get(t, np.nan) for t in turns]
        xi = x + (i - (n_series - 1) / 2) * width
        valid = [(xx, h) for xx, h in zip(xi, heights) if not np.isnan(h)]
        if not valid:
            continue
        vx, vh = zip(*valid)
        ax.bar(vx, vh, width=width, color=color, alpha=0.85, label=label, zorder=2)

    ax.axhline(0, color="#333333", linewidth=1, zorder=1)
    ax.set_xticks(x)
    ax.set_xticklabels([str(t) for t in turns])
    ax.set_ylim(y_min - pad, y_max + pad)

    finalize_axis(
        ax,
        title=f"Score Improvement per Turn, {ref_name.capitalize()} — One-Turn Extensions",
        xlabel="Turn number (branch point)",
        ylabel="Increase in match to target from this turn to the next",
        subtitle="Human's own real next turn vs. each model's counterfactual one-turn extension from the same state. "
                  "A missing bar means no data (session ended, or the model chose to stop).",
    )
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.18), frameon=False, ncol=4)

    out_path = FIGS / f"fig12_branch_sweep_delta_bars_{ref_name}.png"
    save_fig(fig, out_path)


if __name__ == "__main__":
    main()
