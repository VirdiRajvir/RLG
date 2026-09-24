"""
A2A trajectory collage, v3 — combined: all references, all driver models, all
runs in ONE image (unlike fig_a2a_collage.py, which writes one file per
reference). Adds the reference target as its own leading column so each row
shows what the session was trying to recreate right next to its attempts.

Square 1:1 cells throughout (reference column included) — every screenshot is
scale-to-fit ("contain") within a fixed CELL_SIZE square and centered, same
approach as ReferencePanel.jsx's square-fit panel and the prolific collage
fix. Sizing every cell to a shared max natural height (the old approach)
leaves most cells mostly blank when content heights vary widely; this avoids
that regardless of how tall/short any one screenshot naturally is.

Columns are capped at 6 total per the request: 1 reference column + the
session's first 5 turns. Sessions with more than 5 turns are truncated, not
scrollable — this is a static image.

Rows = every (reference, driver_model, run_index) session in
a2a/features_a2a.csv, grouped by reference (alphabetical), then by driver
model (fixed categorical order, matching fig_a2a_trend.py's color mapping),
then by run_index. Each cell below the reference column is labeled with its
normalized learned-metric score.

Screenshots are read directly from analysis/A2A_analysis/a2a/shots/,
matched by filename convention gen_<refName>_<model>_run<NN>_turn<NN>.png
(generations) and ref_<refName>.png (reference).

  python3.10 analysis/A2A_analysis/a2a/fig_a2a_collage_combined.py
Writes analysis/A2A_analysis/a2a/fig_a2a_collage_combined.png
"""
import json
import re
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

MAX_SCORE = 14.5287
MAX_TURN_COLS = 5   # + 1 reference column = 6 total, per request
HERE = Path(__file__).resolve().parent
SHOTS = HERE / "shots"

# ── dataviz skill palette (light mode) ──────────────────────────────────────
SURFACE      = (252, 252, 251)
GRIDLINE     = (225, 224, 217)
INK_PRIMARY  = (11, 11, 11)
INK_SECOND   = (82, 81, 78)
INK_MUTED    = (137, 135, 129)
CAT_COLORS   = [(42, 120, 214), (235, 104, 52), (27, 175, 122)]  # blue, orange, aqua
REF_COL_BG   = (238, 237, 231)  # faint tint so the reference column reads as distinct from generations

DISPLAY_NAME = {
    "anthropic/claude-opus-5": "Claude Opus 5",
    "google/gemini-3-flash-preview": "Gemini 3 Flash Preview",
    "qwen/qwen2.5-vl-72b-instruct": "Qwen2.5-VL 72B",
}
def display_name(model_id):
    return DISPLAY_NAME.get(model_id, model_id.split("/")[-1].replace("-", " "))

def slug(s):
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", str(s))

def load_font(size, bold=False):
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()

def paste_contain(canvas, img, x, y, size):
    """Scale-to-fit ('contain') img within a size x size square at (x, y), centered."""
    scale = min(size / img.width, size / img.height)
    w, h = max(1, int(img.width * scale)), max(1, int(img.height * scale))
    ox, oy = x + (size - w) // 2, y + (size - h) // 2
    canvas.paste(img.resize((w, h)), (ox, oy))

# ── scores (same frozen weights/normalization as the trend figures) ─────────
cfg = json.load(open("analysis/features-final.json"))
GEO = cfg["kept"]
W = pd.read_csv("analysis/v3/weights_clean.csv")
wr = {r.feature: r.coef_raw for r in W.itertuples()}
wvec = np.array([wr[f] for f in GEO])

d_all = pd.read_csv(HERE / "features_a2a.csv")
if d_all.empty:
    raise SystemExit(f"{HERE / 'features_a2a.csv'} is empty — run data_pipeline/features_a2a.js first.")
d_all["reference_name"] = d_all["reference_name"].str.strip('"')

d = d_all[d_all["k"] >= 2].copy()
d["norm_score"] = (d[GEO].to_numpy() @ wvec) / MAX_SCORE
score_of = {(r.reference_name, r.driver_model, int(r.run_index), int(r.turn)): r.norm_score for r in d.itertuples()}

# ── rows: every session, grouped by reference (alphabetical), then driver
# model (fixed order matching the trend chart's color mapping), then run ────
models_sorted = sorted(d_all["driver_model"].unique())
color_of_model = {m: CAT_COLORS[i % len(CAT_COLORS)] for i, m in enumerate(models_sorted)}
rows = sorted(
    {(r.reference_name, r.driver_model, int(r.run_index)) for r in d_all.itertuples()},
    key=lambda rmr: (rmr[0], models_sorted.index(rmr[1]) if rmr[1] in models_sorted else 99, rmr[2]),
)

cols = list(range(1, MAX_TURN_COLS + 1))  # turn columns only; reference is a separate leading column

# ── load reference images (one per unique reference_name) and generation
# screenshots (capped at MAX_TURN_COLS turns per session) ───────────────────
ref_images = {}
for ref_name in sorted(d_all["reference_name"].unique()):
    path = SHOTS / f"ref_{slug(ref_name)}.png"
    if path.exists():
        ref_images[ref_name] = Image.open(path)

images = {}   # (ref_name, model, run, turn) -> PIL Image
for ref_name, model, run in rows:
    for t in cols:
        path = SHOTS / f"gen_{slug(ref_name)}_{slug(model)}_run{run:02d}_turn{t:02d}.png"
        if path.exists():
            images[(ref_name, model, run, t)] = Image.open(path)

if not images:
    raise SystemExit(f"No screenshots found in {SHOTS} — run data_pipeline/features_a2a.js first.")

# ── fixed square cells throughout, reference column included ────────────────
CELL_SIZE = 220
SCORE_H, ROW_LABEL_W, COL_HEADER_H, ROW_ACCENT_W, PAD, TITLE_H = 26, 210, 34, 6, 4, 78

cell_total_w = CELL_SIZE + PAD
cell_total_h = CELL_SIZE + SCORE_H + PAD

n_cols_total = 1 + len(cols)  # reference column + turn columns
canvas_w = ROW_LABEL_W + ROW_ACCENT_W + n_cols_total * cell_total_w + PAD
canvas_h = TITLE_H + COL_HEADER_H + len(rows) * cell_total_h + PAD

canvas = Image.new("RGB", (canvas_w, canvas_h), SURFACE)
draw = ImageDraw.Draw(canvas)

font_title, font_sub = load_font(22, bold=True), load_font(13)
font_label, font_score, font_col = load_font(13), load_font(12), load_font(12)

n_sessions = len(rows)
n_refs = d_all["reference_name"].nunique()
draw.text((PAD, 14), "A2A trajectory collage v3 — combined (all references)", font=font_title, fill=INK_PRIMARY)
draw.text((PAD, 42), f"{n_sessions} sessions across {n_refs} references, {len(models_sorted)} driver models "
                      f"— reference + first {MAX_TURN_COLS} turns, truncated; each cell: screenshot + normalized score",
          font=font_sub, fill=INK_SECOND)

x0, y0 = ROW_LABEL_W + ROW_ACCENT_W, TITLE_H + COL_HEADER_H

# Column headers: "REF" for the reference column, then turn numbers.
draw.text((x0 + CELL_SIZE / 2, TITLE_H + COL_HEADER_H / 2), "REF", font=font_col, fill=INK_MUTED, anchor="mm")
for j, t in enumerate(cols):
    x = x0 + (j + 1) * cell_total_w
    draw.text((x + CELL_SIZE / 2, TITLE_H + COL_HEADER_H / 2), str(t), font=font_col, fill=INK_MUTED, anchor="mm")

for i, (ref_name, model, run) in enumerate(rows):
    y = y0 + i * cell_total_h
    draw.rectangle([PAD, y, PAD + ROW_ACCENT_W, y + cell_total_h - PAD], fill=color_of_model[model])
    label_x = PAD + ROW_ACCENT_W + 8
    draw.text((label_x, y + cell_total_h / 2 - 18), ref_name, font=font_label, fill=INK_PRIMARY)
    draw.text((label_x, y + cell_total_h / 2 - 2), display_name(model), font=font_label, fill=INK_SECOND)
    draw.text((label_x, y + cell_total_h / 2 + 14), f"run {run}", font=font_label, fill=INK_SECOND)

    # Reference column
    rx = x0
    draw.rectangle([rx, y, rx + CELL_SIZE, y + CELL_SIZE], fill=REF_COL_BG, outline=GRIDLINE, width=1)
    ref_img = ref_images.get(ref_name)
    if ref_img is not None:
        paste_contain(canvas, ref_img, rx, y, CELL_SIZE)

    # Turn columns
    for j, t in enumerate(cols):
        x = x0 + (j + 1) * cell_total_w
        key = (ref_name, model, run, t)
        draw.rectangle([x, y, x + CELL_SIZE, y + CELL_SIZE], outline=GRIDLINE, width=1)
        if key in images:
            paste_contain(canvas, images[key], x, y, CELL_SIZE)
            score_text = f"{score_of[key]:.2f}" if key in score_of else "—"
        else:
            score_text = ""
        draw.text((x + CELL_SIZE / 2, y + CELL_SIZE + SCORE_H / 2), score_text,
                   font=font_score, fill=INK_SECOND, anchor="mm")

out_path = HERE / "fig_a2a_collage_combined.png"
canvas.save(out_path)
print(f"saved {out_path} ({canvas_w}x{canvas_h}px)")
print(f"{n_sessions} sessions across {n_refs} references, {len(images)} generation screenshots placed "
      f"(truncated to first {MAX_TURN_COLS} turns/session)")
