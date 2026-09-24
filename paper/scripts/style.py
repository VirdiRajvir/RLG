"""
Shared visual style for the workshop paper figures. Import and call
apply_style() once at the top of every figure script, then use COLORS for
series color, and finalize_axis()/save_fig() to keep every figure
consistent (same fonts, same line weights, same print-safe sizing).
"""
import matplotlib.pyplot as plt
import matplotlib as mpl

COLORS = {
    "human": "#111111",
    "claude": "#D97757",
    "gemini": "#3B7DD8",
    "qwen": "#2FA35B",
}

LABELS = {
    "human": "Human",
    "claude": "Claude",
    "gemini": "Gemini",
    "qwen": "Qwen",
}

CLAUDE_SHADES = {
    "claude_uncapped": "#D97757",
    "claude_capped": "#F0A97A",
    "claude_no_thinking": "#8C4A2F",
    "claude_element_cap": "#C2410C",
    "claude_human_style": "#7A3B12",
    "claude_human_style_no_numbers": "#4A1D0A",
}

# All 6 Claude ablation conditions plus human, in a consistent draw order —
# used by the fewshot_claude/ figures (Claude-only comparisons, no
# Gemini/Qwen).
CLAUDE_LEVELS_AND_HUMAN = [
    ("human", "Human", "#111111"),
    ("claude_uncapped", "Claude, speaking freely", CLAUDE_SHADES["claude_uncapped"]),
    ("claude_capped", "Claude, short instructions only", CLAUDE_SHADES["claude_capped"]),
    ("claude_no_thinking", "Claude, thinking turned off", CLAUDE_SHADES["claude_no_thinking"]),
    ("claude_element_cap", "Claude, 4 elements per turn max", CLAUDE_SHADES["claude_element_cap"]),
    ("claude_human_style", "Claude, human-style few-shot", CLAUDE_SHADES["claude_human_style"]),
    ("claude_human_style_no_numbers", "Claude, human-style + no exact numbers", CLAUDE_SHADES["claude_human_style_no_numbers"]),
]

# Every condition in the paper, human + all 5 Claude levels + Gemini + Qwen.
ALL_CONDITIONS = CLAUDE_LEVELS_AND_HUMAN + [
    ("gemini", "Gemini", "#3B7DD8"),
    ("qwen", "Qwen", "#2FA35B"),
]

# The six conditions used across the multi-condition figures, in a
# consistent draw order and with a consistent color and plain-English label.
ALL_SIX = [
    ("human", "Human", "#111111"),
    ("claude_uncapped", "Claude, speaking freely", CLAUDE_SHADES["claude_uncapped"]),
    ("claude_capped", "Claude, short instructions only", CLAUDE_SHADES["claude_capped"]),
    ("claude_no_thinking", "Claude, thinking turned off", CLAUDE_SHADES["claude_no_thinking"]),
    ("gemini", "Gemini", "#3B7DD8"),
    ("qwen", "Qwen", "#2FA35B"),
]

# Marker shape per condition, held constant across every figure — color
# alone doesn't survive black-and-white printing, so shape is the second
# channel. Every one of the 9 conditions that appears in any curve figure
# gets its own shape here; a figure with fewer series just uses the subset
# it needs, but a given condition is always the same shape everywhere.
MARKERS = {
    "human": "o",               # circle
    "claude_uncapped": "^",     # triangle up
    "claude_capped": "s",       # square
    "claude_no_thinking": "D",  # diamond
    "claude_element_cap": "P",  # filled plus
    "claude_human_style": "v",  # triangle down
    "claude_human_style_no_numbers": "p",  # pentagon
    "gemini": "*",              # star
    "qwen": "X",                # filled X
}

AVERAGE_LINE_WIDTH = 3.4
INDIVIDUAL_LINE_WIDTH = 1.2
INDIVIDUAL_ALPHA = 0.22
MARKER_SIZE = 7

# matplotlib draws star/triangle/plus/X noticeably smaller than circle/square
# /diamond at the same markersize (their glyphs don't fill their bounding box
# the same way) — this scale factor equalizes their visual size. Keyed by
# marker glyph (not condition) so it also covers CAT_MARKERS in
# fig6_prompt_type_analysis.py, which reuses '^' for the same reason.
MARKER_SCALE = {"o": 1.0, "s": 1.0, "D": 1.0, "^": 1.5, "*": 1.5, "X": 1.5, "P": 1.5, "v": 1.5, "p": 1.5}

def marker_size(marker, base=MARKER_SIZE):
    """Linear point size for ax.plot(markersize=...)."""
    return base * MARKER_SCALE[marker]

def scatter_size(marker, base):
    """Area size for ax.scatter(s=...) — scatter's s is area, not linear
    size, so the scale factor above is squared here to look consistent with
    marker_size()'s linear scaling in ax.plot."""
    return base * MARKER_SCALE[marker] ** 2

def apply_style():
    mpl.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 13,
        "axes.titlesize": 17,
        "axes.titleweight": "bold",
        "axes.labelsize": 14,
        "xtick.labelsize": 12,
        "ytick.labelsize": 12,
        "legend.fontsize": 12,
        "axes.edgecolor": "#333333",
        "axes.linewidth": 1.1,
        "axes.grid": True,
        "grid.color": "#dddddd",
        "grid.linewidth": 0.8,
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "savefig.facecolor": "white",
        "savefig.dpi": 300,
        "lines.solid_capstyle": "round",
    })

def finalize_axis(ax, title, xlabel, ylabel, subtitle=None):
    """Applies the shared clean look: plain axis labels, light grid, and
    open top/right spines removed. Titles are intentionally not rendered
    (removed per project decision) — `title` is still accepted so call
    sites don't all need editing, it's just unused. subtitle, if given,
    sits where the title used to."""
    if subtitle:
        ax.text(0.0, 1.02, subtitle, transform=ax.transAxes,
                 fontsize=11.5, color="#555555", ha="left", va="bottom")
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(True, axis="both")

def save_fig(fig, out_path):
    fig.tight_layout()
    # pad_inches guarantees a small margin around the "tight" bbox so a tall
    # rotated y-axis label is never flush against the very edge of the canvas.
    fig.savefig(out_path, dpi=300, bbox_inches="tight", pad_inches=0.25)
    print(f"saved {out_path}")
