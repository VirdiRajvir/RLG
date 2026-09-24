"""
Four figures analyzing the Haiku multi-label prompt classifications
(data/prompt_classifications.csv: Creation / Removal / Adjustment, an
instruction can be more than one at once) against turn number, instruction
length, and score gain.

  1) fig6a_category_share_by_turn.png  - grouped bars: % of instructions of
     each type, by turn number (bars, first 8 turns).
  2) fig6b_chars_by_category.png       - instruction length (characters) by
     type, box plot with individual instructions overlaid as dots.
  3) fig6c_score_gain_by_category.png  - average score gained on a turn,
     grouped by the type of instruction given that turn.
  4) fig6d_category_trend_overlay.png  - the type-share-by-turn line trends
     from (1), overlaid on one axis instead of grouped bars.
  5) fig6e_category_share_by_turn_human_vs_ai.png - the same chart as (1),
     split into a human panel and an AI panel (all non-human conditions
     pooled) so the two speaker types are directly comparable.
  6) fig6f_score_gain_by_category_human_vs_ai.png - the same chart as (3),
     split into a human panel and an AI panel.
  7) fig6g_category_share_by_turn_human_vs_claude.png - same as (5), but the
     right panel is Claude only (gemini and qwen excluded).

  python3.10 paper/scripts/fig6_prompt_type_analysis.py
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load_all, DATA_DIR
from style import apply_style, finalize_axis, save_fig, marker_size

FIGS = Path(__file__).resolve().parents[1] / "figs"
MAX_TURN = 8

CATS = ["is_creation", "is_removal", "is_adjustment"]
CAT_LABELS = {"is_creation": "Creation", "is_removal": "Removal", "is_adjustment": "Adjustment"}
CAT_COLORS = {"is_creation": "#3B7DD8", "is_removal": "#D64545", "is_adjustment": "#2FA35B"}
# Marker shapes for the one curve in this file (fig_category_trend_overlay)
# that plots lines with point markers — same black-and-white-safe idea as
# style.py's MARKERS, just for instruction types instead of speakers.
CAT_MARKERS = {"is_creation": "o", "is_removal": "s", "is_adjustment": "^"}


def load_merged():
    """Classification rows joined to their score/character data, keyed on
    (conversation_id, turn). Score gain is computed on the full per-turn
    sequence first (so the previous turn is never missing), then merged
    down to just the classified rows."""
    cls = pd.read_csv(DATA_DIR / "prompt_classifications.csv")

    d = load_all().sort_values(["conversation_id", "turn"])
    d["prev_score"] = d.groupby("conversation_id")["score"].shift(1).fillna(0.0)
    d["gain"] = d["score"] - d["prev_score"]

    return cls.merge(d[["conversation_id", "turn", "gain"]], on=["conversation_id", "turn"], how="inner")


def fig_category_share_by_turn(d):
    dt = d[d["turn"] <= MAX_TURN]
    turns = sorted(dt["turn"].unique())
    share = {cat: [100 * dt.loc[dt["turn"] == t, cat].mean() for t in turns] for cat in CATS}
    counts = [len(dt[dt["turn"] == t]) for t in turns]

    fig, ax = plt.subplots(figsize=(11, 5.5))
    x = np.arange(len(turns))
    width = 0.26
    for i, cat in enumerate(CATS):
        ax.bar(x + (i - 1) * width, share[cat], width=width, color=CAT_COLORS[cat],
               label=f"{CAT_LABELS[cat]} (n = {sum(1 for v in d[cat] if v)})")
    ax.set_xticks(x)
    ax.set_xticklabels([str(t) for t in turns])
    for xi, n in zip(x, counts):
        ax.text(xi, 102, f"n={n}", ha="center", va="bottom", fontsize=9, color="#555555")
    ax.set_ylim(0, 112)

    finalize_axis(
        ax, title="What Kind of Instructions Are Given on Each Turn",
        xlabel="Turn number", ylabel="Share of instructions of this type (%)",
        subtitle="An instruction can be more than one type at once, so bars do not sum to 100%.",
    )
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=3)
    save_fig(fig, FIGS / "fig6a_category_share_by_turn.png")


def _category_share_by_turn_split(d, right_conditions, right_label, out_name):
    """Shared two-panel builder: left panel is always human, right panel is
    whichever conditions right_conditions selects (e.g. all non-human, or
    just the three Claude ablation conditions)."""
    dt = d[d["turn"] <= MAX_TURN]
    turns = sorted(dt["turn"].unique())
    x = np.arange(len(turns))
    width = 0.26

    fig, axes = plt.subplots(1, 2, figsize=(15, 5.5), sharey=True)
    panels = [
        (dt[dt["condition"] == "human"], "Human", axes[0]),
        (dt[dt["condition"].isin(right_conditions)], right_label, axes[1]),
    ]
    for ds, speaker_label, ax in panels:
        counts = [len(ds[ds["turn"] == t]) for t in turns]
        for i, cat in enumerate(CATS):
            share = [100 * ds.loc[ds["turn"] == t, cat].mean() if len(ds[ds["turn"] == t]) else 0 for t in turns]
            ax.bar(x + (i - 1) * width, share, width=width, color=CAT_COLORS[cat],
                   label=f"{CAT_LABELS[cat]} (n = {int(ds[cat].sum())} of {len(ds)} {speaker_label.lower()} instructions)")
        ax.set_xticks(x)
        ax.set_xticklabels([str(t) for t in turns])
        for xi, n in zip(x, counts):
            ax.text(xi, 102, f"n={n}", ha="center", va="bottom", fontsize=9, color="#555555")
        ax.set_ylim(0, 112)
        ax.set_title(speaker_label, loc="left", fontsize=15, fontweight="bold", pad=10)
        ax.set_xlabel("Turn number")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(True, axis="both")
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.18), frameon=False, ncol=1, fontsize=10.5)
    axes[0].set_ylabel("Share of instructions of this type (%)")

    fig.text(0.03, 0.99, "An instruction can be more than one type at once, so bars do not sum to 100%.",
              fontsize=11.5, color="#555555", ha="left", va="bottom")
    save_fig(fig, FIGS / out_name)


ALL_AI_CONDITIONS = ["claude_uncapped", "claude_capped", "claude_no_thinking", "gemini", "qwen"]
CLAUDE_ONLY_CONDITIONS = ["claude_uncapped", "claude_capped", "claude_no_thinking"]

# Order matters here: this is a stack, drawn bottom-to-top.
STACK_ORDER = ["is_creation", "is_removal", "is_adjustment"]
MODEL_PANELS = [("human", "Human"), ("claude_uncapped", "Claude"), ("gemini", "Gemini"), ("qwen", "Qwen")]


def fig_category_share_by_turn_split(d):
    """One stacked bar per turn per model: Creation, Removal, and Adjustment
    shares stacked on top of each other. Since an instruction can be more
    than one type, the stack can rise above the 100% line (dashed) instead
    of being capped there — the overflow itself is the point: it shows how
    much double-counting happens for that model on that turn."""
    dt = d[d["turn"] <= MAX_TURN]
    turns = list(range(1, MAX_TURN + 1))

    fig, axes = plt.subplots(1, 4, figsize=(19, 5.5), sharey=True)
    totals = []
    for (model_key, model_label), ax in zip(MODEL_PANELS, axes):
        ds = dt[dt["condition"] == model_key]
        counts = [len(ds[ds["turn"] == t]) for t in turns]
        shares = {cat: [100 * ds.loc[ds["turn"] == t, cat].mean() if len(ds[ds["turn"] == t]) else 0
                         for t in turns] for cat in STACK_ORDER}

        bottom = np.zeros(len(turns))
        for cat in STACK_ORDER:
            heights = np.array(shares[cat])
            ax.bar(turns, heights, bottom=bottom, width=0.62, color=CAT_COLORS[cat],
                   label=CAT_LABELS[cat])
            bottom += heights
        totals.append(bottom.max() if len(bottom) else 0)

        ax.axhline(100, color="#333333", linewidth=1, linestyle="--", alpha=0.6)
        ax.set_xticks(turns)
        for t, n in zip(turns, counts):
            top = 100 * (ds.loc[ds["turn"] == t, "is_creation"].mean() +
                          ds.loc[ds["turn"] == t, "is_removal"].mean() +
                          ds.loc[ds["turn"] == t, "is_adjustment"].mean()) if n else 0
            ax.text(t, top + 4, f"n={n}", ha="center", va="bottom", fontsize=8.5, color="#555555")
        ax.set_title(f"{model_label} (n = {len(ds)})", loc="left", fontsize=15, fontweight="bold", pad=10)
        ax.set_xlabel("Turn number")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(True, axis="both")
    axes[0].set_ylabel("Share of instructions of this type (%)")
    y_top = max(totals) * 1.12
    for ax in axes:
        ax.set_ylim(0, y_top)

    fig.text(0.03, 0.99,
              "Each bar stacks the three type shares; bars taller than the dashed 100% line show instructions "
              "counted in more than one type. Claude is the unrestricted (speaking-freely) condition only.",
              fontsize=11, color="#555555", ha="left", va="bottom")
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", bbox_to_anchor=(0.5, -0.02), frameon=False, ncol=3)
    save_fig(fig, FIGS / "fig6e_category_share_by_turn_human_vs_ai.png")


def fig_category_share_by_turn_split_claude(d):
    _category_share_by_turn_split(d, CLAUDE_ONLY_CONDITIONS, "Claude", "fig6g_category_share_by_turn_human_vs_claude.png")


def fig_chars_by_category(d):
    fig, ax = plt.subplots(figsize=(9, 5.5))
    groups = [d.loc[d[cat] == 1, "chars"] for cat in CATS]

    bp = ax.boxplot(groups, positions=range(len(CATS)), widths=0.5, patch_artist=True,
                     showfliers=False, medianprops={"color": "#111111", "linewidth": 2})
    for patch, cat in zip(bp["boxes"], CATS):
        patch.set_facecolor(CAT_COLORS[cat])
        patch.set_alpha(0.35)
        patch.set_edgecolor(CAT_COLORS[cat])

    rng = np.random.default_rng(0)
    for i, cat in enumerate(CATS):
        vals = d.loc[d[cat] == 1, "chars"]
        jitter = rng.uniform(-0.16, 0.16, size=len(vals))
        ax.scatter(i + jitter, vals, color=CAT_COLORS[cat], s=18, alpha=0.5, zorder=3, linewidths=0)

    ax.set_xticks(range(len(CATS)))
    ax.set_xticklabels([f"{CAT_LABELS[cat]}\n(n = {int(d[cat].sum())})" for cat in CATS])

    finalize_axis(
        ax, title="Instruction Length by Type",
        xlabel="Instruction type", ylabel="Characters in the instruction",
        subtitle="Box shows the middle 50% of instructions of that type; dots are individual instructions.",
    )
    save_fig(fig, FIGS / "fig6b_chars_by_category.png")


def fig_score_gain_by_category(d):
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
        ax, title="Score Improvement by Instruction Type",
        xlabel="Instruction type", ylabel="Increase in match to target on that turn",
        subtitle="Bars show the average change in score (error bars: standard error); dots are individual turns.",
    )
    save_fig(fig, FIGS / "fig6c_score_gain_by_category.png")


def fig_score_gain_by_category_split(d):
    """One panel per speaker (human, Claude-unrestricted, Gemini, Qwen),
    each showing the bar+dots score-gain-by-type chart from
    fig_score_gain_by_category, so the four are directly comparable."""
    y_min = min(0, d["gain"].min())
    y_max = d["gain"].max()
    pad = 0.06 * (y_max - y_min)

    fig, axes = plt.subplots(1, 4, figsize=(17, 5.5), sharey=True)
    rng = np.random.default_rng(0)
    for (model_key, model_label), ax in zip(MODEL_PANELS, axes):
        ds = d[d["condition"] == model_key]
        groups = [ds.loc[ds[cat] == 1, "gain"] for cat in CATS]
        means = [g.mean() if len(g) else 0 for g in groups]
        sems = [g.sem() if len(g) > 1 else 0 for g in groups]

        ax.axhspan(y_min - pad, 0, color="#D64545", alpha=0.08, zorder=0)
        ax.bar(range(len(CATS)), means, yerr=sems, capsize=6,
               color=[CAT_COLORS[c] for c in CATS], alpha=0.55,
               error_kw={"ecolor": "#333333", "linewidth": 1.6, "zorder": 4}, zorder=2)
        for i, cat in enumerate(CATS):
            vals = groups[i]
            jitter = rng.uniform(-0.16, 0.16, size=len(vals))
            ax.scatter(i + jitter, vals, color=CAT_COLORS[cat], s=18, alpha=0.55,
                       zorder=3, linewidths=0.6, edgecolors="white")

        ax.set_xticks(range(len(CATS)))
        ax.set_xticklabels([f"{CAT_LABELS[cat]}\n(n = {int(ds[cat].sum())})" for cat in CATS])
        ax.axhline(0, color="#333333", linewidth=1, zorder=1)
        ax.set_ylim(y_min - pad, y_max + pad)
        ax.set_title(f"{model_label} (n = {len(ds)})", loc="left", fontsize=15, fontweight="bold", pad=10)
        ax.set_xlabel("Instruction type")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(True, axis="both")
    axes[0].set_ylabel("Increase in match to target on that turn")

    fig.text(0.03, 0.99,
              "Bars show the average change in score (error bars: standard error); dots are individual turns. "
              "Claude is the unrestricted (speaking-freely) condition only.",
              fontsize=11, color="#555555", ha="left", va="bottom")
    save_fig(fig, FIGS / "fig6f_score_gain_by_category_human_vs_ai.png")


def fig_category_trend_overlay(d):
    dt = d[d["turn"] <= MAX_TURN]
    turns = sorted(dt["turn"].unique())

    fig, ax = plt.subplots(figsize=(11, 5.5))
    for cat in CATS:
        share = [100 * dt.loc[dt["turn"] == t, cat].mean() for t in turns]
        ax.plot(turns, share, color=CAT_COLORS[cat], linewidth=3.4, marker=CAT_MARKERS[cat],
                 markersize=marker_size(CAT_MARKERS[cat], base=7),
                 label=f"{CAT_LABELS[cat]} (n = {int(d[cat].sum())})")

    ax.set_xticks(turns)
    ax.set_ylim(0, 105)
    finalize_axis(
        ax, title="Instruction Type Trends Across Turns",
        xlabel="Turn number", ylabel="Share of instructions of this type (%)",
        subtitle="Same data as the grouped-bar chart, drawn as overlapping trend lines instead.",
    )
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=3)
    save_fig(fig, FIGS / "fig6d_category_trend_overlay.png")


def main():
    apply_style()
    d = load_merged()
    fig_category_share_by_turn(d)
    fig_category_share_by_turn_split(d)
    fig_category_share_by_turn_split_claude(d)
    fig_chars_by_category(d)
    fig_score_gain_by_category(d)
    fig_score_gain_by_category_split(d)
    fig_category_trend_overlay(d)


if __name__ == "__main__":
    main()
