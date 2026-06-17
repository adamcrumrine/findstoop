#!/usr/bin/env python3
"""
Frame live Stoop screenshots into branded 1200x1200 LinkedIn posts:
a headline + a browser-window mockup of the real captured page + logo.

Inputs:  marketing/screenshots/<name>-fold.png  (live dev-server captures)
Outputs: marketing/linkedin/shot-<name>.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "marketing", "screenshots")
OUT = os.path.join(ROOT, "marketing", "linkedin")
LOGO = os.path.join(ROOT, "public", "stoop_logo_horizontal_trans.png")

TEAL = (0, 130, 117)
TEAL_DK = (0, 110, 98)
INK = (58, 58, 60)
MUTE = (110, 110, 115)
TEAL_50 = (230, 249, 246)
WHITE = (255, 255, 255)
GRAYBAR = (242, 243, 245)
DOT = (205, 208, 212)
BORDER = (220, 224, 227)

FREG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FBLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
W = H = 1200


def f(size, bold=True):
    return ImageFont.truetype(FBLD if bold else FREG, size)


def tw(d, s, ft):
    b = d.textbbox((0, 0), s, font=ft)
    return b[2] - b[0]


def build_window(name, cw, ch, bar_h=60, radius=22):
    """A rounded browser window (RGBA) of size cw x (bar_h+ch)."""
    win = Image.new("RGBA", (cw, bar_h + ch), (0, 0, 0, 0))
    layer = Image.new("RGB", (cw, bar_h + ch), WHITE)
    ld = ImageDraw.Draw(layer)
    # title bar
    ld.rectangle([0, 0, cw, bar_h], fill=GRAYBAR)
    for cx in (32, 60, 88):
        ld.ellipse([cx - 7, bar_h // 2 - 7, cx + 7, bar_h // 2 + 7], fill=DOT)
    pill_w, pill_h = 360, 34
    px = cw // 2 - pill_w // 2
    py = bar_h // 2 - pill_h // 2
    ld.rounded_rectangle([px, py, px + pill_w, py + pill_h], pill_h // 2, fill=WHITE)
    uf = f(24)
    ld.text((cw // 2 - tw(ld, "stoop.com", uf) // 2, py + 5), "stoop.com", font=uf, fill=MUTE)
    # screenshot
    shot = Image.open(os.path.join(SHOTS, name + "-fold.png")).convert("RGB")
    scale = cw / shot.width
    nh = int(shot.height * scale)
    shot = shot.resize((cw, nh), Image.LANCZOS).crop((0, 0, cw, min(ch, nh)))
    layer.paste(shot, (0, bar_h))
    # rounded mask
    mask = Image.new("L", (cw, bar_h + ch), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, bar_h + ch - 1], radius, fill=255)
    win.paste(layer, (0, 0), mask)
    # border
    ImageDraw.Draw(win).rounded_rectangle([0, 0, cw - 1, bar_h + ch - 1], radius,
                                          outline=BORDER, width=2)
    return win


def frame(name, eyebrow, headline):
    img = Image.new("RGB", (W, H), TEAL_50)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 12], fill=TEAL)
    d.text((80, 70), eyebrow, font=f(26), fill=TEAL_DK)
    y = 116
    for ln in headline:
        d.text((80, y), ln, font=f(54), fill=INK)
        y += 64

    # window
    win_x0, win_y0, win_x1, win_y1 = 80, 300, 1120, 1058
    cw, total_h = win_x1 - win_x0, win_y1 - win_y0
    bar_h = 60
    win = build_window(name, cw, total_h - bar_h, bar_h=bar_h)
    # soft shadow
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [win_x0 + 6, win_y0 + 14, win_x1 + 6, win_y1 + 14], 22, fill=(0, 60, 55, 40))
    img = Image.alpha_composite(img.convert("RGBA"), sh).convert("RGB")
    img.paste(win, (win_x0, win_y0), win)
    d = ImageDraw.Draw(img)

    # footer — strip the logo's near-white halo so it sits cleanly on tinted bg
    logo = Image.open(LOGO).convert("RGBA")
    px = logo.load()
    for j in range(logo.height):
        for i in range(logo.width):
            r, g, b, a = px[i, j]
            if r > 244 and g > 244 and b > 244:
                px[i, j] = (r, g, b, 0)
    lw = 230
    lh = int(logo.height * lw / logo.width)
    logo = logo.resize((lw, lh), Image.LANCZOS)
    img.paste(logo, (80, H - lh - 38), logo)
    ff = f(28)
    d.text((W - 80 - tw(d, "stoop.com", ff), H - 68), "stoop.com", font=ff, fill=MUTE)

    out = os.path.join(OUT, f"shot-{name}.png")
    img.save(out)
    print("wrote", os.path.basename(out))


if __name__ == "__main__":
    frame("home", "THE PRODUCT", ["Run your rentals like a pro —", "without becoming one."])
    frame("tenability", "MEET TENABILITY™", ["Every applicant arrives", "with a 0–100 score."])
    frame("pricing", "SIMPLE PRICING", ["One plan. Every feature.", "$9 per unit / month."])
    print("done")
