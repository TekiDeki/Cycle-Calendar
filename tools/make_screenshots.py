#!/usr/bin/env python3
"""Capture the README screenshots and the social image.

Desktop is deliberately NOT full page and sits at scroll 0, so the README shows
the real first screen. The social image is composed locally with PIL, no
external service.
"""

from __future__ import annotations

import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
URL = "http://127.0.0.1:8765/index.html"
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def start_server() -> subprocess.Popen | None:
    try:
        urllib.request.urlopen(URL, timeout=2).read(10)
        return None
    except Exception:
        process = subprocess.Popen(
            [sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(40):
            try:
                urllib.request.urlopen(URL, timeout=1).read(10)
                return process
            except Exception:
                time.sleep(0.25)
        raise RuntimeError("server did not start")


def seed(page) -> None:
    """Load the sample history so the screenshots show a populated app."""
    if page.locator("#onboard").is_visible():
        page.locator("#onboardSample").click()
        page.wait_for_timeout(400)
    page.evaluate("document.getElementById('toast').hidden = true")
    page.wait_for_timeout(250)


def capture() -> None:
    SHOTS.mkdir(exist_ok=True)
    with sync_playwright() as play:
        browser = play.chromium.launch()

        desktop = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
        page = desktop.new_page()
        page.goto(URL, wait_until="networkidle")
        seed(page)
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / "desktop.png"))
        page.locator("#tab-insights").click()
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / "insights.png"))
        page.locator("#langSelect").select_option("sr-cyrl")
        page.locator("#tab-calendar").click()
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / "serbian-cyrillic.png"))
        page.locator("#langSelect").select_option("en")
        page.locator("#themeBtn").click()
        page.wait_for_timeout(350)
        page.screenshot(path=str(SHOTS / "dark.png"))
        desktop.close()

        tablet = browser.new_context(viewport={"width": 820, "height": 1180}, has_touch=True, is_mobile=True)
        page = tablet.new_page()
        page.goto(URL, wait_until="networkidle")
        seed(page)
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / "tablet.png"))
        tablet.close()

        browser.close()


def social_image() -> None:
    shot = Image.open(SHOTS / "desktop.png").convert("RGB")
    width, height = 1200, 630
    canvas = Image.new("RGB", (width, height), "#f7f4f6")
    draw = ImageDraw.Draw(canvas)

    # Soft brand wash on the left.
    for y in range(height):
        for x in range(0, 520, 4):
            t = (x / 520) * 0.5 + (y / height) * 0.5
            draw.rectangle([x, y, x + 4, y + 1],
                           fill=(round(246 - 26 * t), round(228 - 60 * t), round(236 - 42 * t)))

    title_font = ImageFont.truetype(FONT_BOLD, 62)
    tag_font = ImageFont.truetype(FONT_REG, 27)
    small_font = ImageFont.truetype(FONT_REG, 21)
    label_font = ImageFont.truetype(FONT_BOLD, 20)

    left = 64
    draw.rounded_rectangle([left, 96, left + 74, 170], radius=22, fill="#8d2f5b")
    draw.ellipse([left + 18, 120, left + 56, 158], fill="#ffffff")
    draw.ellipse([left + 30, 132, left + 44, 146], fill="#c63f6d")

    draw.text((left, 200), "Cycle", font=title_font, fill="#1d1720")
    draw.text((left, 268), "Calendar", font=title_font, fill="#8d2f5b")
    draw.text((left, 356), "A private menstrual calendar", font=tag_font, fill="#574b54")
    draw.text((left, 392), "with predictions from your own", font=tag_font, fill="#574b54")
    draw.text((left, 428), "averages. No account, no cloud.", font=tag_font, fill="#574b54")

    for index, label in enumerate(("English", "Română", "Srpski", "Српски")):
        x = left + index * 104
        draw.rounded_rectangle([x, 484, x + 96, 518], radius=17, outline="#d9cbd2", width=2, fill="#ffffff")
        draw.text((x + 12, 492), label, font=label_font, fill="#574b54")

    # App card on the right.
    card_x, card_y, card_w = 616, 74, 520
    shot_ratio = shot.height / shot.width
    card_h = int(card_w * shot_ratio)
    card = shot.resize((card_w, card_h), Image.LANCZOS)
    mask = Image.new("L", (card_w, card_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, card_w - 1, card_h - 1], radius=18, fill=255)
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle([card_x - 6, card_y + 10, card_x + card_w + 6, card_y + card_h + 22],
                                  radius=24, fill=(29, 23, 32, 40))
    shadow = shadow.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(12))
    canvas.paste(shadow, (0, 0), shadow)
    canvas.paste(card, (card_x, card_y), mask)
    border = ImageDraw.Draw(canvas)
    border.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=18,
                             outline="#e3d7dd", width=2)

    draw.text((left, 560), "Cycle Calendar · TekiDeki · Apache 2.0", font=small_font, fill="#8a7a84")
    canvas.save(SHOTS / "og.png", optimize=True)
    print("og.png", canvas.size)


def main() -> None:
    server = start_server()
    try:
        capture()
        social_image()
    finally:
        if server:
            server.terminate()
    for name in ("desktop.png", "tablet.png", "insights.png", "serbian-cyrillic.png", "dark.png", "og.png"):
        path = SHOTS / name
        print(f"{name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
