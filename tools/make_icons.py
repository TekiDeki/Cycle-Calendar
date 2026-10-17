#!/usr/bin/env python3
"""Draw the Cycle Calendar icon set. Deterministic, no external assets."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
SS = 4  # supersampling factor


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def gradient(size: int, top=(216, 84, 127), bottom=(123, 40, 77)) -> Image.Image:
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x / size * 0.45) + (y / size * 0.55)
            pixels[x, y] = (
                lerp(top[0], bottom[0], t),
                lerp(top[1], bottom[1], t),
                lerp(top[2], bottom[2], t),
            )
    return image


def draw_icon(size: int, full_bleed: bool = False) -> Image.Image:
    edge = size * SS
    base = gradient(edge)

    if not full_bleed:
        mask = Image.new("L", (edge, edge), 0)
        radius = round(edge * 0.22)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, edge - 1, edge - 1], radius=radius, fill=255)
        image = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
        image.paste(base, (0, 0), mask)
    else:
        image = base.convert("RGBA")

    draw = ImageDraw.Draw(image)
    # Glyph occupies the middle 66% so a maskable icon keeps its safe zone.
    scale = 0.82 if full_bleed else 1.0
    page_w = edge * 0.56 * scale
    page_h = edge * 0.52 * scale
    left = (edge - page_w) / 2
    top = (edge - page_h) / 2 + edge * 0.035
    right = left + page_w
    bottom = top + page_h
    radius = page_w * 0.13

    # Hanger tabs, drawn first so the page overlaps them.
    tab_w = page_w * 0.11
    tab_h = page_h * 0.20
    for cx in (left + page_w * 0.26, right - page_w * 0.26):
        draw.rounded_rectangle(
            [cx - tab_w / 2, top - tab_h * 0.55, cx + tab_w / 2, top + tab_h * 0.35],
            radius=tab_w / 2,
            fill=(255, 255, 255, 235),
        )

    draw.rounded_rectangle([left, top, right, bottom], radius=radius, fill=(255, 255, 255, 255))

    # Header band in the brand ink.
    band_h = page_h * 0.24
    band = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
    band_draw = ImageDraw.Draw(band)
    band_draw.rounded_rectangle([left, top, right, top + band_h], radius=radius, fill=(141, 47, 91, 255))
    band_draw.rectangle([left, top + band_h - radius, right, top + band_h], fill=(141, 47, 91, 255))
    image.alpha_composite(band)
    draw = ImageDraw.Draw(image)

    # Grid of cycle dots; the third one is the marked day.
    cols, rows = 3, 3
    grid_top = top + band_h + page_h * 0.13
    grid_h = bottom - grid_top - page_h * 0.12
    step_x = page_w / (cols + 1)
    step_y = grid_h / (rows + 0.35)
    dot_r = min(step_x, step_y) * 0.23
    marked = (1, 2)
    for row in range(rows):
        for col in range(cols):
            cx = left + step_x * (col + 1)
            cy = grid_top + step_y * (row + 0.5)
            color = (198, 63, 109, 255) if (col, row) == marked else (223, 205, 214, 255)
            r = dot_r * (1.25 if (col, row) == marked else 1.0)
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS.mkdir(exist_ok=True)
    sizes = {"icon-192.png": (192, False), "icon-512.png": (512, False),
             "icon-maskable-512.png": (512, True), "apple-touch-icon.png": (180, True)}
    for name, (size, bleed) in sizes.items():
        target = ROOT / name if name.startswith("apple") else ICONS / name
        draw_icon(size, bleed).save(target, optimize=True)
        print("wrote", target.relative_to(ROOT), size)

    # favicon.ico: 16, 32 and 48 px in one file.
    frames = [draw_icon(size, True).convert("RGBA") for size in (16, 32, 48)]
    frames[0].save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)],
                   append_images=frames[1:])
    print("wrote favicon.ico")


if __name__ == "__main__":
    main()
