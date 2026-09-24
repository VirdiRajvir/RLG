"""
The 5 kept references, side by side in one row of square panels. No labels,
no titles — just the target layouts themselves.

  python3.10 paper/scripts/fig13_all_references_row.py
"""
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = Path(__file__).resolve().parents[2]
FIGS = Path(__file__).resolve().parents[1] / "figs"
A2A_SHOTS = REPO_ROOT / "analysis/A2A_analysis/a2a/shots"

REFERENCES = ["midcentury", "steel", "stickynotes", "retro", "darkminimal"]

SURFACE = (255, 255, 255)
GRIDLINE = (210, 208, 200)
INK_PRIMARY = (17, 17, 17)

CELL = 260
PAD = 14
BORDER = 2


def slug(s):
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", str(s))


def paste_contain(canvas, img, x, y, size):
    scale = min(size / img.width, size / img.height)
    w, h = max(1, int(img.width * scale)), max(1, int(img.height * scale))
    ox, oy = x + (size - w) // 2, y + (size - h) // 2
    small = img.resize((w, h), Image.LANCZOS)
    small = small.filter(ImageFilter.UnsharpMask(radius=2, percent=220, threshold=2))
    canvas.paste(small, (ox, oy))


def main():
    n = len(REFERENCES)
    canvas_w = n * CELL + (n + 1) * PAD
    canvas_h = CELL + 2 * PAD
    canvas = Image.new("RGB", (canvas_w, canvas_h), SURFACE)
    draw = ImageDraw.Draw(canvas)

    for i, ref_name in enumerate(REFERENCES):
        x = PAD + i * (CELL + PAD)
        y = PAD
        draw.rectangle([x - BORDER, y - BORDER, x + CELL + BORDER, y + CELL + BORDER],
                        outline=INK_PRIMARY, width=BORDER)
        draw.rectangle([x, y, x + CELL, y + CELL], fill=(238, 237, 231), outline=GRIDLINE)
        img_path = A2A_SHOTS / f"ref_{slug(ref_name)}.png"
        if img_path.exists():
            paste_contain(canvas, Image.open(img_path), x, y, CELL)

    out_path = FIGS / "fig13_all_references_row.png"
    canvas.save(out_path)
    print(f"saved {out_path} ({canvas_w}x{canvas_h}px)")


if __name__ == "__main__":
    main()
