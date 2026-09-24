"""
A2A trajectory collage, v3: same as ../a2a_v2/fig_a2a_collage.py, but reads
from a2a/features_a2a.csv (the run_index>=6 batch — the re-run under the
corrected A2A prompts; see data_pipeline/features_a2a.js) and loops
over every reference present in that data, writing one PNG per reference.

Rows = sessions (grouped by driver model, colored to match fig_a2a_trend.py's
categorical order), columns = turn number. Missing cells (a session that
ended before that turn) render as blank placeholders. Each cell is labeled
with its normalized learned-metric score.

Cell size is derived from the actual images, not guessed: a fixed target
width, and a height equal to the TALLEST scaled image in the whole grid, so
nothing gets cropped — shorter images are top-aligned within that height.

Screenshots are read directly from analysis/A2A_analysis/a2a/shots/
(written by data_pipeline/features_a2a.js), matched by filename
convention gen_<refName>_<model>_run<NN>_turn<NN>.png.

  python3.10 analysis/A2A_analysis/a2a/fig_a2a_collage.py
Writes analysis/A2A_analysis/a2a/fig_a2a_collage_<refName>.png (one file per reference).
"""
import json
import re
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

MAX_SCORE = 14.5287
HERE = Path(__file__).resolve().parent
SHOTS = HERE / "shots"

# ── dataviz skill palette (light mode) ──────────────────────────────────────
SURFACE      = (252, 252, 251)
GRIDLINE     = (225, 224, 217)
INK_PRIMARY  = (11, 11, 11)
INK_SECOND   = (82, 81, 78)
INK_MUTED    = (137, 135, 129)
CAT_COLORS   = [(42, 120, 214), (235, 104, 52), (27, 175, 122)]  # blue, orange, aqua

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

for REF_NAME in sorted(d_all["reference_name"].unique()):
    d = d_all[(d_all["k"] >= 2) & (d_all["reference_name"] == REF_NAME)].copy()
    if d.empty:
        print(f"skipping {REF_NAME!r} — no k>=2 rows")
        continue
    d["norm_score"] = (d[GEO].to_numpy() @ wvec) / MAX_SCORE
    score_of = {(r.driver_model, int(r.run_index), int(r.turn)): r.norm_score for r in d.itertuples()}

    rows = sorted({(r.driver_model, int(r.run_index)) for r in d.itertuples()})
    models_sorted = sorted(d["driver_model"].unique())
    color_of_model = {m: CAT_COLORS[i % len(CAT_COLORS)] for i, m in enumerate(models_sorted)}

    max_turn = int(d["turn"].max())
    cols = list(range(1, max_turn + 1))

    images = {}   # (model, run, turn) -> PIL Image
    for model, run in rows:
        for t in cols:
            path = SHOTS / f"gen_{slug(REF_NAME)}_{slug(model)}_run{run:02d}_turn{t:02d}.png"
            if path.exists():
                images[(model, run, t)] = Image.open(path)

    if not images:
        print(f"skipping {REF_NAME!r} — no screenshots found in {SHOTS}")
        continue

    CELL_W = 220
    CELL_IMG_H = max(int(img.height * (CELL_W / img.width)) for img in images.values())

    SCORE_H, ROW_LABEL_W, COL_HEADER_H, ROW_ACCENT_W, PAD, TITLE_H = 26, 210, 34, 6, 4, 70

    cell_total_w = CELL_W + PAD
    cell_total_h = CELL_IMG_H + SCORE_H + PAD

    canvas_w = ROW_LABEL_W + ROW_ACCENT_W + len(cols) * cell_total_w + PAD
    canvas_h = TITLE_H + COL_HEADER_H + len(rows) * cell_total_h + PAD

    canvas = Image.new("RGB", (canvas_w, canvas_h), SURFACE)
    draw = ImageDraw.Draw(canvas)

    font_title, font_sub = load_font(22, bold=True), load_font(13)
    font_label, font_score, font_col = load_font(13), load_font(12), load_font(12)

    draw.text((PAD, 14), f"A2A trajectory collage v3 — {REF_NAME}", font=font_title, fill=INK_PRIMARY)
    draw.text((PAD, 42), f"{len(rows)} sessions x up to {max_turn} turns "
                          f"— each cell: screenshot + normalized score (1.0 = exact reference match)",
              font=font_sub, fill=INK_SECOND)

    x0, y0 = ROW_LABEL_W + ROW_ACCENT_W, TITLE_H + COL_HEADER_H

    for j, t in enumerate(cols):
        x = x0 + j * cell_total_w
        draw.text((x + CELL_W / 2, TITLE_H + COL_HEADER_H / 2), str(t), font=font_col, fill=INK_MUTED, anchor="mm")

    for i, (model, run) in enumerate(rows):
        y = y0 + i * cell_total_h
        draw.rectangle([PAD, y, PAD + ROW_ACCENT_W, y + cell_total_h - PAD], fill=color_of_model[model])
        label_x = PAD + ROW_ACCENT_W + 8
        draw.text((label_x, y + cell_total_h / 2 - 10), display_name(model), font=font_label, fill=INK_PRIMARY)
        draw.text((label_x, y + cell_total_h / 2 + 6), f"run {run}", font=font_label, fill=INK_SECOND)

        for j, t in enumerate(cols):
            x = x0 + j * cell_total_w
            key = (model, run, t)
            draw.rectangle([x, y, x + CELL_W, y + CELL_IMG_H], outline=GRIDLINE, width=1)
            if key in images:
                img = images[key]
                h = int(img.height * (CELL_W / img.width))
                canvas.paste(img.resize((CELL_W, h)), (x, y))
                score_text = f"{score_of[key]:.2f}" if key in score_of else "—"
            else:
                score_text = ""
            draw.text((x + CELL_W / 2, y + CELL_IMG_H + SCORE_H / 2), score_text,
                       font=font_score, fill=INK_SECOND, anchor="mm")

    out_path = HERE / f"fig_a2a_collage_{slug(REF_NAME)}.png"
    canvas.save(out_path)
    print(f"saved {out_path} ({canvas_w}x{canvas_h}px)")
    print(f"  {len(rows)} sessions, {max_turn} turns, {len(images)} screenshots placed")
