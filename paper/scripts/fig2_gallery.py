"""
Gallery figure: the target layout at the top, then one row per speaker
(Human, Claude, Gemini, Qwen) showing their first five turns and their
final turn, for a small set of references. Speaker rows are picked as
one representative, well-populated session per condition rather than an
average, so the images are real single sessions, not composites.

  python3.10 paper/scripts/fig2_gallery.py
"""
import csv
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO_ROOT = Path(__file__).resolve().parents[2]
FIGS = Path(__file__).resolve().parents[1] / "figs"
A2A_SHOTS = REPO_ROOT / "analysis/A2A_analysis/a2a/shots"
A2A_FEATURES = REPO_ROOT / "analysis/A2A_analysis/a2a/features_a2a.csv"
H2A_SHOTS = REPO_ROOT / "analysis/A2A_analysis/prolific/shots"
H2A_FEATURES = REPO_ROOT / "analysis/A2A_analysis/prolific/features_prolific.csv"

# Pick the reference and, for each speaker, one representative session with
# enough turns to fill every column. "a2a_run" is the default run used for
# every AI speaker in that reference block; "a2a_run_overrides" swaps in a
# different run for one specific model (used for stickynotes' Claude row,
# whose run 6 session never set a page-level background color, so empty
# space between its boxes rendered black under this environment's default
# dark color scheme — run 7 does not have that gap).
REFERENCES = [
    {"name": "midcentury", "h2a_session": "73147b0a-789a-42e7-a036-a81b12788448",
     "a2a_run": 6, "a2a_run_overrides": {"claude": 7}},
    # {"name": "stickynotes", "h2a_session": "8e2815ad-d4ee-40ee-9769-c238307a61f5",
    #  "a2a_run": 6, "a2a_run_overrides": {"claude": 7}},
]

CLAUDE_MODEL = "anthropic/claude-opus-5"
GEMINI_MODEL = "google/gemini-3-flash-preview"
QWEN_MODEL = "qwen/qwen2.5-vl-72b-instruct"

ROWS = [
    ("human", "Human", (17, 17, 17)),
    ("claude", "Claude", (217, 119, 87)),
    ("gemini", "Gemini", (59, 125, 216)),
    ("qwen", "Qwen", (47, 163, 91)),
]
FIRST_COLS = [1, 2, 3, 4, 5]

SURFACE = (255, 255, 255)
GRIDLINE = (210, 208, 200)
INK_PRIMARY, INK_SECOND, INK_MUTED = (17, 17, 17), (70, 70, 70), (120, 120, 120)

CELL = 128
LABEL_W = 130
COL_HEADER_H = 34
TITLE_H = 16
TARGET_H = CELL + 46
REF_GAP = 40
PAD = 6

def slug(s):
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", str(s))

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
    # Shrinking a ~1080px screenshot down to a ~128px thumbnail anti-aliases
    # the wireframe's 1px borders into faint grey. An unsharp mask pulls
    # that contrast back so the borders read as lines again at this size.
    small = small.filter(ImageFilter.UnsharpMask(radius=2, percent=220, threshold=2))
    canvas.paste(small, (ox, oy))

def h2a_turn_images(session_id):
    rows = list(csv.DictReader(open(H2A_FEATURES)))
    session_rows = [r for r in rows if r["conversation_id"] == session_id]
    session_rows.sort(key=lambda r: int(r["turn"]))
    last_turn = int(session_rows[-1]["turn"])
    by_turn = {int(r["turn"]): r["generation_id"] for r in session_rows}
    out = {}
    for t in FIRST_COLS + [last_turn]:
        gen_id = by_turn.get(t)
        if gen_id is None:
            continue
        path = H2A_SHOTS / f"gen_{gen_id}.png"
        if path.exists():
            out[t if t in FIRST_COLS else "last"] = Image.open(path)
    return out, last_turn

def a2a_turn_images(ref_name, model, run):
    rows = list(csv.DictReader(open(A2A_FEATURES)))
    session_rows = [r for r in rows if r["reference_name"] == ref_name
                     and r["driver_model"] == model and r["run_index"] == str(run)]
    session_rows.sort(key=lambda r: int(r["turn"]))
    if not session_rows:
        return {}, None
    last_turn = int(session_rows[-1]["turn"])
    out = {}
    for t in FIRST_COLS + [last_turn]:
        path = A2A_SHOTS / f"gen_{slug(ref_name)}_{slug(model)}_run{run:02d}_turn{t:02d}.png"
        if path.exists():
            out[t if t in FIRST_COLS else "last"] = Image.open(path)
    return out, last_turn

def build_reference_block(ref):
    ref_name = ref["name"]
    target_img_path = A2A_SHOTS / f"ref_{slug(ref_name)}.png"
    target_img = Image.open(target_img_path) if target_img_path.exists() else None

    overrides = ref.get("a2a_run_overrides", {})
    h2a_imgs, h2a_last = h2a_turn_images(ref["h2a_session"])
    claude_imgs, claude_last = a2a_turn_images(ref_name, CLAUDE_MODEL, overrides.get("claude", ref["a2a_run"]))
    gemini_imgs, gemini_last = a2a_turn_images(ref_name, GEMINI_MODEL, overrides.get("gemini", ref["a2a_run"]))
    qwen_imgs, qwen_last = a2a_turn_images(ref_name, QWEN_MODEL, overrides.get("qwen", ref["a2a_run"]))

    row_images = {"human": h2a_imgs, "claude": claude_imgs, "gemini": gemini_imgs, "qwen": qwen_imgs}
    row_last = {"human": h2a_last, "claude": claude_last, "gemini": gemini_last, "qwen": qwen_last}
    return ref_name, target_img, row_images, row_last

def main():
    blocks = [build_reference_block(ref) for ref in REFERENCES]

    n_cols_total = len(FIRST_COLS) + 1
    block_w = LABEL_W + n_cols_total * (CELL + PAD)
    block_h = TARGET_H + COL_HEADER_H + len(ROWS) * (CELL + PAD)
    canvas_w = block_w + 2 * PAD
    canvas_h = TITLE_H + len(blocks) * (block_h + REF_GAP)

    canvas = Image.new("RGB", (canvas_w, canvas_h), SURFACE)
    draw = ImageDraw.Draw(canvas)
    font_ref = load_font(15, bold=True)
    font_label = load_font(14)
    font_col = load_font(13)
    font_target = load_font(12, bold=True)

    y_cursor = TITLE_H
    for ref_name, target_img, row_images, row_last in blocks:
        x0 = PAD

        # target box, centered over the row grid
        target_x = x0 + LABEL_W + (n_cols_total * (CELL + PAD) - CELL) // 2
        target_y = y_cursor
        draw.text((target_x + CELL / 2, target_y), f"Target ({ref_name})", font=font_target,
                   fill=INK_SECOND, anchor="mm")
        box_y = target_y + 16
        draw.rectangle([target_x - 3, box_y - 3, target_x + CELL + 3, box_y + CELL + 3],
                        outline=INK_PRIMARY, width=2)
        draw.rectangle([target_x, box_y, target_x + CELL, box_y + CELL], fill=(238, 237, 231), outline=GRIDLINE)
        if target_img is not None:
            paste_contain(canvas, target_img, target_x, box_y, CELL)

        grid_y0 = y_cursor + TARGET_H
        col_header_y = grid_y0 + COL_HEADER_H / 2
        for j, t in enumerate(FIRST_COLS):
            cx = x0 + LABEL_W + j * (CELL + PAD) + CELL / 2
            draw.text((cx, col_header_y), f"Turn {t}", font=font_col, fill=INK_MUTED, anchor="mm")
        cx_last = x0 + LABEL_W + len(FIRST_COLS) * (CELL + PAD) + CELL / 2
        draw.text((cx_last, col_header_y), "Final", font=font_col, fill=INK_MUTED, anchor="mm")

        grid_y1 = grid_y0 + COL_HEADER_H
        for i, (row_key, row_label, row_color) in enumerate(ROWS):
            y = grid_y1 + i * (CELL + PAD)
            draw.rectangle([x0, y, x0 + 5, y + CELL], fill=row_color)
            last_t = row_last.get(row_key)
            label_text = row_label if last_t is None else f"{row_label}\n({last_t} turns)"
            draw.multiline_text((x0 + 14, y + CELL / 2), label_text, font=font_label,
                                  fill=INK_PRIMARY, anchor="lm", spacing=4)

            imgs = row_images.get(row_key, {})
            for j, t in enumerate(FIRST_COLS):
                x = x0 + LABEL_W + j * (CELL + PAD)
                draw.rectangle([x, y, x + CELL, y + CELL], outline=GRIDLINE, width=1)
                if t in imgs:
                    paste_contain(canvas, imgs[t], x, y, CELL)
            x_last = x0 + LABEL_W + len(FIRST_COLS) * (CELL + PAD)
            draw.rectangle([x_last, y, x_last + CELL, y + CELL], outline=GRIDLINE, width=1)
            if "last" in imgs:
                paste_contain(canvas, imgs["last"], x_last, y, CELL)

        y_cursor += block_h + REF_GAP

    OUT = FIGS / "fig2_gallery.png"
    canvas.save(OUT)
    print(f"saved {OUT} ({canvas_w}x{canvas_h}px)")

if __name__ == "__main__":
    main()
