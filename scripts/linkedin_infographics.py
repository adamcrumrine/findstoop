#!/usr/bin/env python3
"""
Generate a series of on-brand LinkedIn infographics for Stoop (stoop.com).

Brand + copy are pulled straight from the live site source:
  - colours: apps/web/tailwind.config.ts  (brand teal, ink, mute)
  - copy:    apps/web/src/pages/marketing/Home.tsx
  - logo:    public/stoop_logo_horizontal_trans.png

Renders 1200x1200 PNGs (LinkedIn square) via cairosvg.
"""
import base64
import os
import textwrap
import cairosvg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "marketing", "linkedin")
LOGO = os.path.join(ROOT, "public", "stoop_logo_horizontal_trans.png")
os.makedirs(OUT, exist_ok=True)

# ── brand tokens (from tailwind.config.ts) ───────────────────────────────
TEAL        = "#008275"   # brand-500, AA on white
TEAL_DK     = "#006e62"   # brand-600
TEAL_DK2    = "#005951"   # brand-700
TEAL_BRIGHT = "#00B4A2"   # brand-400 / gradient highlight
TEAL_GRAD0  = "#00A896"
TEAL_50     = "#e6f9f6"
TEAL_100    = "#b3ebe3"
INK         = "#3A3A3C"
MUTE        = "#6E6E73"
WHITE       = "#FFFFFF"
GREEN       = "#15803d"

FONT = "Liberation Sans, Arial, Helvetica, sans-serif"
W = H = 1200

with open(LOGO, "rb") as f:
    LOGO_B64 = base64.b64encode(f.read()).decode()
LOGO_HREF = f"data:image/png;base64,{LOGO_B64}"

# ── tiny svg helpers ─────────────────────────────────────────────────────
def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def text(x, y, s, size, color=INK, weight="normal", anchor="start",
         spacing=None, opacity=1, style="normal"):
    ls = f' letter-spacing="{spacing}"' if spacing is not None else ""
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" font-style="{style}" fill="{color}" '
            f'text-anchor="{anchor}" opacity="{opacity}"{ls}>{esc(s)}</text>')

def wrap(x, y, s, size, color, weight, width_chars, line_h, anchor="start", spacing=None):
    lines = textwrap.wrap(s, width=width_chars)
    out = []
    for i, ln in enumerate(lines):
        out.append(text(x, y + i * line_h, ln, size, color, weight, anchor, spacing))
    return "".join(out), y + (len(lines) - 1) * line_h

def rrect(x, y, w, h, r, fill, stroke=None, sw=0, opacity=1):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" ry="{r}" '
            f'fill="{fill}" opacity="{opacity}"{s}/>')

def check(cx, cy, size, color):
    s = size
    return (f'<path d="M{cx-s} {cy} l{s*0.7} {s*0.7} l{s*1.3} {-s*1.5}" '
            f'fill="none" stroke="{color}" stroke-width="{max(3,size*0.45)}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')

def logo(x, y, w, opacity=1):
    h = w * 345 / 1149
    return f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="{LOGO_HREF}" opacity="{opacity}"/>'

def chip(x, y, label, fill=TEAL_100, color=TEAL_DK2, size=26, pad=22):
    w = len(label) * size * 0.56 + pad * 2
    h = size + pad
    return (rrect(x, y, w, h, h / 2, fill) +
            text(x + pad, y + h / 2 + size * 0.35, label, size, color, "bold")), w

def footer(tag="stoop.com"):
    # logo bottom-left, url bottom-right
    return (logo(70, H - 118, 250) +
            text(W - 70, H - 70, tag, 30, MUTE, "bold", "end", spacing="1"))

def card_open(bg=WHITE):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="{bg}"/>')

def save(name, svg):
    svg += "</svg>"
    sp = os.path.join(OUT, name + ".svg")
    with open(sp, "w") as f:
        f.write(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(OUT, name + ".png"),
                     output_width=W, output_height=H)
    print("wrote", name + ".png")

# ════════════════════════════════════════════════════════════════════════
# 1 — Brand intro / hero
# ════════════════════════════════════════════════════════════════════════
def slide_intro():
    s = card_open(WHITE)
    # soft brand wash top-right
    s += f'<circle cx="1150" cy="120" r="520" fill="{TEAL_50}"/>'
    s += rrect(0, 0, W, 14, 0, TEAL)  # top accent bar
    s += logo(70, 110, 360)
    ch, _ = chip(72, 290, "$9 / unit / month  ·  every feature included", TEAL_50, TEAL_DK2, 28)
    s += ch
    s += text(70, 470, "Run your rentals", 96, INK, "bold")
    s += text(70, 575, "like a pro —", 96, INK, "bold")
    s += text(70, 680, "without becoming one.", 96, TEAL, "bold")
    body, _ = wrap(72, 770, "List vacancies, screen applicants, sign leases, and "
                   "collect rent online. Built for landlords with a handful of "
                   "units, not a hundred.", 36, MUTE, "normal", 56, 50)
    s += body
    s += footer()
    save("01-intro", s)

# ════════════════════════════════════════════════════════════════════════
# 2 — Tenability score (the differentiator)
# ════════════════════════════════════════════════════════════════════════
def slide_tenability():
    s = card_open(WHITE)
    s += rrect(0, 0, W, 14, 0, TEAL)
    s += text(70, 150, "MEET TENABILITY™", 30, TEAL_DK, "bold", spacing="3")
    s += text(70, 235, "Every applicant arrives", 64, INK, "bold")
    s += text(70, 305, "with a score.", 64, INK, "bold")

    # gauge / big number
    cx, cy, r = 600, 565, 185
    s += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{TEAL_50}" stroke-width="46"/>'
    # 82% arc (0.82 of circle), start at top
    import math
    frac = 0.82
    a0 = -math.pi / 2
    a1 = a0 + 2 * math.pi * frac
    x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
    x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
    large = 1 if frac > 0.5 else 0
    s += (f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 {large} 1 {x1:.1f} {y1:.1f}" '
          f'fill="none" stroke="{TEAL}" stroke-width="46" stroke-linecap="round"/>')
    s += text(cx, cy - 6, "82", 150, INK, "bold", "middle")
    s += text(cx, cy + 64, "TENABILITY™  ·  0–100", 26, MUTE, "bold", "middle", spacing="2")

    # three proof points
    items = [
        ("Verified income", "bank-linked, not a screenshot"),
        ("Verified ID", "real person, selfie match on Pro"),
        ("Fair-Housing-safe", "protected-class signals ignored"),
    ]
    y = 840
    for title, sub in items:
        s += check(110, y, 26, TEAL)
        s += text(160, y + 10, title, 38, INK, "bold")
        s += text(160, y + 50, sub, 28, MUTE)
        y += 95
    s += rrect(70, 1100, 1060, 70, 16, TEAL_50)
    s += text(W/2, 1144, "Verified pre-qualification from $5 — paid by the applicant.",
              28, TEAL_DK, "bold", "middle")
    save("02-tenability", s)

# ════════════════════════════════════════════════════════════════════════
# 3 — All-in-one feature stack
# ════════════════════════════════════════════════════════════════════════
def slide_features():
    s = card_open(WHITE)
    s += rrect(0, 0, W, 14, 0, TEAL)
    s += text(70, 150, "ONE LOGIN. EVERYTHING.", 30, TEAL_DK, "bold", spacing="3")
    s += text(70, 235, "Every landlord chore,", 60, INK, "bold")
    s += text(70, 302, "in one place.", 60, INK, "bold")

    feats = [
        ("Screening", "AI Tenability™ on every applicant"),
        ("Applications", "one standard form, side by side"),
        ("Leases & e-sign", "50-state templates, audit log"),
        ("Rent collection", "ACH free, auto late fees"),
        ("Maintenance", "tickets, photos, priority"),
        ("Messaging", "one thread per lease"),
    ]
    # 2 columns x 3 rows of cards
    cw, chh, gx, gy = 510, 175, 40, 30
    x0, y0 = 70, 370
    for i, (t, d) in enumerate(feats):
        col, row = i % 2, i // 2
        x = x0 + col * (cw + gx)
        y = y0 + row * (chh + gy)
        s += rrect(x, y, cw, chh, 22, TEAL_50)
        # numbered dot
        s += f'<circle cx="{x+58}" cy="{y+58}" r="30" fill="{TEAL}"/>'
        s += check(x + 47, y + 58, 18, WHITE)
        s += text(x + 108, y + 56, t, 36, INK, "bold")
        s += text(x + 108, y + 102, d, 26, MUTE)
    s += text(70, 1140, "Accounting & per-property P&L in beta — CSV ready for Schedule E.",
              28, MUTE, "normal")
    save("03-features", s)

# ════════════════════════════════════════════════════════════════════════
# 4 — Pricing simplicity
# ════════════════════════════════════════════════════════════════════════
def slide_pricing():
    s = card_open(WHITE)
    s += f'<rect width="{W}" height="{H}" fill="{TEAL}"/>'
    s += (f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
          f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
          f'<stop offset="0" stop-color="{TEAL_GRAD0}"/>'
          f'<stop offset="1" stop-color="{TEAL_DK2}"/></linearGradient></defs>')
    s += text(W/2, 200, "ONE PLAN. EVERY FEATURE.", 32, "#CFF3EE", "bold", "middle", spacing="3")
    s += text(W/2, 280, "No upsell ladder.", 56, WHITE, "bold", "middle")
    # price block
    s += text(W/2, 560, "$9", 320, WHITE, "bold", "middle")
    s += text(W/2, 640, "per active unit / month", 40, "#E4FBF7", "normal", "middle")
    # white card with inclusions
    s += rrect(150, 720, 900, 330, 28, WHITE)
    incl = ["ACH rent — free for your tenants",
            "50-state lease templates + e-sign",
            "Screening, maintenance, messaging & more"]
    y = 800
    for it in incl:
        s += check(220, y, 24, TEAL)
        s += text(270, y + 10, it, 32, INK, "bold")
        y += 88
    s += text(W/2, 1140, "stoop.com  ·  or $90 / unit / year", 32, WHITE, "bold", "middle", spacing="1")
    save("04-pricing", s)

# ════════════════════════════════════════════════════════════════════════
# 5 — Market stat
# ════════════════════════════════════════════════════════════════════════
def slide_market():
    s = card_open(WHITE)
    s += rrect(0, 0, W, 14, 0, TEAL)
    s += text(W/2, 250, "WHO STOOP IS BUILT FOR", 30, TEAL_DK, "bold", "middle", spacing="3")
    s += text(W/2, 470, "73%", 280, TEAL, "bold", "middle")
    body, yend = wrap(W/2, 600, "of US rental properties are owned by individuals — "
                      "not institutions.", 52, INK, "bold", 26, 70, "middle")
    s += body
    s += text(W/2, yend + 110,
              "The landlord with a handful of units has been stuck with",
              34, MUTE, "normal", "middle")
    s += text(W/2, yend + 158,
              "spreadsheets and enterprise tools built for someone else.",
              34, MUTE, "normal", "middle")
    s += text(W/2, yend + 240, "Stoop is built for them.", 44, TEAL_DK, "bold", "middle")
    s += text(W/2, 1135, "Source: US Census Bureau, Rental Housing Finance Survey",
              24, MUTE, "normal", "middle")
    save("05-market", s)

# ════════════════════════════════════════════════════════════════════════
# 6 — Rent collection
# ════════════════════════════════════════════════════════════════════════
def slide_rent():
    s = card_open(WHITE)
    s += f'<circle cx="1180" cy="120" r="430" fill="{TEAL_50}"/>'
    s += rrect(0, 0, W, 14, 0, TEAL)
    s += text(70, 160, "RENT COLLECTION", 30, TEAL_DK, "bold", spacing="3")
    s += text(70, 290, "Stop refreshing", 84, INK, "bold")
    s += text(70, 380, "your bank app", 84, INK, "bold")
    s += text(70, 470, "on the 1st.", 84, TEAL, "bold")

    rows = [
        ("Tenants pay by ACH (free) or card", ""),
        ("Reminders auto-send 3 days before due", ""),
        ("Late fees apply themselves — your rules", ""),
    ]
    y = 640
    for t, _ in rows:
        s += rrect(70, y, 1060, 110, 20, WHITE, TEAL_100, 2)
        s += f'<circle cx="135" cy="{y+55}" r="30" fill="{TEAL}"/>'
        s += check(124, y + 55, 18, WHITE)
        s += text(195, y + 67, t, 38, INK, "bold")
        y += 138
    s += footer()
    save("06-rent", s)

if __name__ == "__main__":
    slide_intro()
    slide_tenability()
    slide_features()
    slide_pricing()
    slide_market()
    slide_rent()
    print("\nAll infographics written to", OUT)
