"""
Collage figure for A2A/reference_branch_sweep.py: every human turn of one
reference (darkminimal) as its own row, with five columns —

    Human so far | Human at N+1 | Claude at N+1 | Qwen at N+1 | Gemini at N+1

"Human so far" and "Human at N+1" are the real, historical screenshots (not
regenerated); Claude/Qwen/Gemini's cells are the counterfactual one-turn
extensions from the same branch point, all through the same fixed generator
model (see reference_branch_sweep.py's docstring for why).

Reads: paper/data/branch_sweep_<ref>.csv and the screenshots in
paper/data/branch_sweep_<ref>/.

  python3.10 paper/scripts/fig11_branch_sweep_collage.py
  python3.10 paper/scripts/fig11_branch_sweep_collage.py --ref steel
"""
import argparse
import csv
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "paper" / "data"
FIGS = Path(__file__).resolve().parents[1] / "figs"

COLUMNS = [
    ("before", "Human so far", (17, 17, 17)),
    ("human_next", "Human at N+1", (17, 17, 17)),
    ("claude", "Claude at N+1", (217, 119, 87)),
    ("qwen", "Qwen at N+1", (47, 163, 91)),
    ("gemini", "Gemini at N+1", (59, 125, 216)),
]

SURFACE = (255, 255, 255)
GRIDLINE = (210, 208, 200)
INK_PRIMARY, INK_SECOND, INK_MUTED = (17, 17, 17), (70, 70, 70), (120, 120, 120)
PLACEHOLDER_BG = (242, 242, 242)

CELL = 190
LABEL_W = 150
COL_HEADER_H = 40
TITLE_H = 46
TARGET_H = CELL + 50
PAD = 8
SESSION_GAP = 22


def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def paste_contain(canvas, img, x, y, size):
    scale = min(size / img.width, size / img.height)
    w, h = max(1, int(img.width * scale)), max(1, int(img.height * scale))
    ox, oy = x + (size - w) // 2, y + (size - h) // 2
    small = img.resize((w, h), Image.LANCZOS)
    small = small.filter(ImageFilter.UnsharpMask(radius=2, percent=220, threshold=2))
    canvas.paste(small, (ox, oy))


def fmt_score(x):
    return "n/a" if x in (None, "", "None") else f"{float(x):.2f}"


def draw_cell(canvas, draw, x, y, img_path, score_text, score_color, placeholder_text, font_score):
    draw.rectangle([x, y, x + CELL, y + CELL], outline=GRIDLINE, width=1, fill=PLACEHOLDER_BG)
    if img_path and img_path.exists():
        paste_contain(canvas, Image.open(img_path), x, y, CELL)
    elif placeholder_text:
        draw.multiline_text((x + CELL / 2, y + CELL / 2), placeholder_text, font=font_score,
                              fill=INK_MUTED, anchor="mm", align="center", spacing=4)
    if score_text:
        tw = draw.textlength(score_text, font=font_score)
        bx, by = x + (CELL - tw) / 2, y + CELL - 20
        draw.rectangle([bx - 4, by - 2, bx + tw + 4, by + 16], fill=(255, 255, 255, 220))
        draw.text((bx, by), score_text, font=font_score, fill=score_color)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", type=str, default="darkminimal")
    args = ap.parse_args()
    ref_name = args.ref

    csv_path = DATA_DIR / f"branch_sweep_{ref_name}.csv"
    if not csv_path.exists():
        raise SystemExit(f"{csv_path} not found — run A2A/reference_branch_sweep.py --ref {ref_name} first.")
    rows = list(csv.DictReader(open(csv_path)))
    shots_dir = DATA_DIR / f"branch_sweep_{ref_name}"

    rows.sort(key=lambda r: (r["conversation_id"], int(r["turn"])))
    sessions = sorted({r["conversation_id"] for r in rows})

    n_rows = len(rows)
    n_sessions = len(sessions)
    n_cols = len(COLUMNS)
    grid_w = LABEL_W + n_cols * (CELL + PAD)
    canvas_w = grid_w + 2 * PAD
    canvas_h = TITLE_H + TARGET_H + COL_HEADER_H + n_rows * (CELL + PAD) + (n_sessions - 1) * SESSION_GAP

    canvas = Image.new("RGB", (canvas_w, canvas_h), SURFACE)
    draw = ImageDraw.Draw(canvas)
    font_sub = load_font(14)
    font_col = load_font(14, bold=True)
    font_label = load_font(13)
    font_score = load_font(12, bold=True)
    font_target = load_font(13, bold=True)

    draw.text((PAD, 14), "Each row branches from a real human turn. Claude/Qwen/Gemini never see that the "
                          "history is human's, and each gets exactly one instruction.",
               font=font_sub, fill=INK_SECOND)

    target_x = PAD + LABEL_W + (n_cols * (CELL + PAD) - CELL) // 2
    target_y = TITLE_H
    draw.text((target_x + CELL / 2, target_y), "Reference target", font=font_target, fill=INK_SECOND, anchor="mm")
    box_y = target_y + 18
    draw.rectangle([target_x - 3, box_y - 3, target_x + CELL + 3, box_y + CELL + 3], outline=INK_PRIMARY, width=2)
    draw.rectangle([target_x, box_y, target_x + CELL, box_y + CELL], fill=(238, 237, 231), outline=GRIDLINE)
    target_path = shots_dir / "target.png"
    if target_path.exists():
        paste_contain(canvas, Image.open(target_path), target_x, box_y, CELL)

    grid_y0 = TITLE_H + TARGET_H
    col_header_y = grid_y0 + COL_HEADER_H / 2
    for j, (_, col_label, col_color) in enumerate(COLUMNS):
        cx = PAD + LABEL_W + j * (CELL + PAD) + CELL / 2
        draw.text((cx, col_header_y), col_label, font=font_col, fill=col_color, anchor="mm")

    y = grid_y0 + COL_HEADER_H
    prev_session = None
    for r in rows:
        if prev_session is not None and r["conversation_id"] != prev_session:
            y += SESSION_GAP
        prev_session = r["conversation_id"]

        label = f"{r['conversation_id'][:8]}_t{r['turn']}"
        is_last = r["is_last_turn"] in ("True", "true", "1")
        row_label = f"{r['conversation_id'][:8]}\nturn {r['turn']}" + ("\n(last turn)" if is_last else "")
        draw.multiline_text((PAD + 8, y + CELL / 2), row_label, font=font_label,
                              fill=INK_PRIMARY, anchor="lm", spacing=4)

        cells = {
            "before": (shots_dir / f"{label}_before.png", r.get("score_before"), INK_SECOND, None),
            "human_next": (shots_dir / f"{label}_human_next.png", r.get("score_human_next"), (17, 17, 17),
                            "human stopped here\n(headroom test)" if is_last else "missing"),
            "claude": (shots_dir / f"{label}_claude.png", r.get("score_claude"), (217, 119, 87), "chose to stop"),
            "qwen": (shots_dir / f"{label}_qwen.png", r.get("score_qwen"), (47, 163, 91), "chose to stop"),
            "gemini": (shots_dir / f"{label}_gemini.png", r.get("score_gemini"), (59, 125, 216), "chose to stop"),
        }
        for j, (col_key, _, _) in enumerate(COLUMNS):
            x = PAD + LABEL_W + j * (CELL + PAD)
            path, score, color, placeholder = cells[col_key]
            score_text = f"match: {fmt_score(score)}" if score not in (None, "") else None
            draw_cell(canvas, draw, x, y, path, score_text, color, placeholder, font_score)

        y += CELL + PAD

    OUT = FIGS / f"fig11_branch_sweep_collage_{ref_name}.png"
    canvas.save(OUT)
    print(f"saved {OUT} ({canvas_w}x{canvas_h}px)")


if __name__ == "__main__":
    main()
