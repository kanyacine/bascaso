#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bascaso icon generator.

Produces, from the single vector source described here:
  - bascaso-icon.svg          the vector source
  - bascaso.iconset/          the 10 sizes macOS expects
  - ../../public/icon.png     1024x1024, used by Electron and the "About" page
  - ../../public/icon.icns    the icon bundle consumed by electron-forge
  - ../../src/app/favicon.ico the multi-resolution favicon of the Next.js front end

Usage:  python3 generate-icon.py
Dependencies: pip install cairosvg pillow

The drawing: the Itsyconnect box (lid + body) is the body of an owl whose ear
tufts are built into the shape of the lid itself, with the eyes and beak
inherited from the RespectASO owl.
"""
import math
import os
import struct
import sys

CANVAS = 1024
HALF = 412           # squircle half-side (Apple ratio: 824/1024)
CENTER = 512

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

# --------------------------------------------------------------------- palette
VIOLET_LIGHT = "#A78BFA"
VIOLET = "#8B5CF6"
VIOLET_MID = "#6D28D9"
VIOLET_DEEP = "#3B1178"
LAVENDER_1 = "#F1ECFF"
LAVENDER_2 = "#D9CBFF"
TEAL_LIGHT = "#7FF0DE"
TEAL = "#2DD4BF"
TEAL_DEEP = "#0D9488"
INK = "#1E1B4B"

BODY_RADIUS = 24     # body corner radius: deliberately cubic, Itsyconnect spirit


# -------------------------------------------------------------------- geometry
def squircle(a=HALF, cx=CENTER, cy=CENTER, n=5.0, steps=720):
    """Superellipse of exponent 5: approximates the squircle of Apple icons."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + a * math.copysign(abs(c) ** (2 / n), c),
                    cy + a * math.copysign(abs(s) ** (2 / n), s)))
    return "M %.2f %.2f " % pts[0] + " ".join("L %.2f %.2f" % p for p in pts[1:]) + " Z"


def symmetric_lid(left_half, x_join, bottom_left, bottom=416):
    """Build the lid from its left half only.

    left_half is a list of cubics (c1x, c1y, c2x, c2y, px, py) starting at
    (bottom_left, bottom) and ending on (x_join, 304). The right half is
    obtained by mirroring + reversing each cubic, which guarantees exact
    symmetry rather than one approximated by hand.
    """
    d = "M %g %g " % (bottom_left, bottom)
    for seg in left_half:
        d += "C %g %g %g %g %g %g " % seg
    d += "H %g " % (CANVAS - x_join)
    points = [(bottom_left, bottom)] + [(s[4], s[5]) for s in left_half]
    for i in range(len(left_half) - 1, -1, -1):
        c1x, c1y, c2x, c2y, _, _ = left_half[i]
        p0x, p0y = points[i]
        d += "C %g %g %g %g %g %g " % (CANVAS - c2x, c2y, CANVAS - c1x, c1y,
                                       CANVAS - p0x, p0y)
    return d + "Z"


def lid_path(radius):
    """Lid + ear tufts as one continuous silhouette.

    The two tips on each side run outwards diagonally and are separated by a
    thin groove: that is the gesture of the RespectASO ear tufts, grafted onto
    the lid of the Itsyconnect box.

    The lid is almost flush with the body (edge at 252 against 256 for the body,
    so a 4 px overhang): a wider lid crushes the owl.
    """
    k = radius * 0.45
    return symmetric_lid([
        (252 + k, 416, 252, 416 - k, 252, 416 - radius),   # bottom left corner
        (250, 372, 230, 292, 196, 248),                    # outer tip
        (216, 272, 244, 300, 272, 312),                    # groove
        (268, 302, 258, 282, 246, 272),                    # inner tip
        (258, 284, 280, 302, 304, 304),                    # back to the flat
        (320, 304, 320, 304, 332, 304),                    # join
    ], 332, bottom_left=252 + radius)


def eye(cx, cy, r, pupil=0.42):
    ir = r * 0.86
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r * 2:.1f}" fill="url(#glow)"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="#EFFFFB"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{ir:.1f}" fill="url(#iris)"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{ir * pupil:.1f}" fill="{INK}"/>'
        f'<circle cx="{cx - ir * .30:.1f}" cy="{cy - ir * .34:.1f}" r="{ir * .20:.1f}" '
        f'fill="#FFFFFF" opacity="0.92"/>'
        f'<circle cx="{cx + ir * .26:.1f}" cy="{cy + ir * .30:.1f}" r="{ir * .10:.1f}" '
        f'fill="#FFFFFF" opacity="0.55"/>')


def talons(top=790, fill=VIOLET_MID):
    """Triangular talons, wide base and blunt tip."""
    out = ""
    for cx in (429, 595):
        h, w, tip = 52, 86, 22
        out += (f'<path d="M {cx - w // 2} {top} L {cx + w // 2} {top} '
                f'L {cx + tip // 2} {top + h - 8} Q {cx} {top + h + 4} '
                f'{cx - tip // 2} {top + h - 8} Z" fill="{fill}"/>')
    return out


def build_svg(body_radius=BODY_RADIUS):
    sq = squircle()
    lid = lid_path(min(30, body_radius * 0.42))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" width="{CANVAS}" height="{CANVAS}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="{LAVENDER_1}"/><stop offset="100%" stop-color="{LAVENDER_2}"/>
</linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
  <stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.05"/>
  <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<radialGradient id="shadow" cx="50%" cy="50%" r="50%">
  <stop offset="0%" stop-color="#2E1065" stop-opacity="0.30"/>
  <stop offset="55%" stop-color="#2E1065" stop-opacity="0.16"/>
  <stop offset="100%" stop-color="#2E1065" stop-opacity="0"/>
</radialGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%">
  <stop offset="0%" stop-color="{TEAL}" stop-opacity="0.55"/>
  <stop offset="60%" stop-color="{TEAL}" stop-opacity="0.14"/>
  <stop offset="100%" stop-color="{TEAL}" stop-opacity="0"/>
</radialGradient>
<linearGradient id="body" x1="0.2" y1="0" x2="0.8" y2="1">
  <stop offset="0%" stop-color="{VIOLET_LIGHT}"/><stop offset="55%" stop-color="{VIOLET}"/>
  <stop offset="100%" stop-color="{VIOLET_MID}"/>
</linearGradient>
<linearGradient id="lid" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#B79BFF"/><stop offset="100%" stop-color="{VIOLET}"/>
</linearGradient>
<radialGradient id="iris" cx="42%" cy="36%" r="72%">
  <stop offset="0%" stop-color="{TEAL_LIGHT}"/><stop offset="58%" stop-color="{TEAL}"/>
  <stop offset="100%" stop-color="{TEAL_DEEP}"/>
</radialGradient>
</defs>
<path d="{sq}" fill="url(#bg)"/>
<path d="{sq}" fill="url(#sheen)"/>
<ellipse cx="512" cy="818" rx="244" ry="42" fill="url(#shadow)"/>
<rect x="256" y="366" width="512" height="430" rx="{body_radius}" ry="{body_radius}" fill="url(#body)"/>
<path d="{lid}" fill="url(#lid)"/>
<rect x="256" y="410" width="512" height="8" rx="4" fill="{VIOLET_DEEP}" opacity="0.20"/>
{eye(402, 556, 102)}
{eye(622, 556, 102)}
<path d="M 512 614 L 546 654 L 512 706 L 478 654 Z" fill="{VIOLET_DEEP}"/>
<path d="M 512 614 L 546 654 L 512 662 Z" fill="#FFFFFF" opacity="0.16"/>
{talons()}
</svg>
'''


# ------------------------------------------------------------------------ output
ICONSET = [(16, "icon_16x16"), (32, "icon_16x16@2x"), (32, "icon_32x32"),
           (64, "icon_32x32@2x"), (128, "icon_128x128"), (256, "icon_128x128@2x"),
           (256, "icon_256x256"), (512, "icon_256x256@2x"), (512, "icon_512x512"),
           (1024, "icon_512x512@2x")]

# Same type table as the original Itsyconnect icon, so no compatibility is lost
# across macOS display contexts.
ICNS_TYPES = [(b"ic04", 16), (b"ic05", 32), (b"ic07", 128), (b"ic08", 256),
              (b"ic09", 512), (b"ic10", 1024), (b"ic11", 32), (b"ic12", 64),
              (b"ic13", 256), (b"ic14", 512)]


def main():
    try:
        import cairosvg
        from PIL import Image
    except ImportError:
        sys.exit("Missing dependencies: pip install cairosvg pillow")

    svg = build_svg()
    svg_path = os.path.join(HERE, "bascaso-icon.svg")
    with open(svg_path, "w") as f:
        f.write(svg)
    raw = svg.encode()

    iconset = os.path.join(HERE, "bascaso.iconset")
    os.makedirs(iconset, exist_ok=True)
    for size, name in ICONSET:
        cairosvg.svg2png(bytestring=raw, write_to=os.path.join(iconset, name + ".png"),
                         output_width=size, output_height=size)

    png_by_size = {}
    for _, size in ICNS_TYPES:
        if size not in png_by_size:
            png_by_size[size] = cairosvg.svg2png(bytestring=raw, output_width=size,
                                                 output_height=size)

    icon_png = os.path.join(REPO, "public", "icon.png")
    cairosvg.svg2png(bytestring=raw, write_to=icon_png, output_width=1024, output_height=1024)

    chunks = b""
    for kind, size in ICNS_TYPES:
        data = png_by_size[size]
        chunks += kind + struct.pack(">I", len(data) + 8) + data
    with open(os.path.join(REPO, "public", "icon.icns"), "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)

    ico_sizes = [16, 32, 48, 64, 128, 256]
    base = Image.open(os.path.join(iconset, "icon_512x512@2x.png")).convert("RGBA")
    base.save(os.path.join(REPO, "src", "app", "favicon.ico"), format="ICO",
              sizes=[(s, s) for s in ico_sizes])

    print("icon regenerated:")
    print("  " + svg_path)
    print("  " + iconset)
    print("  " + icon_png)
    print("  " + os.path.join(REPO, "public", "icon.icns"))
    print("  " + os.path.join(REPO, "src", "app", "favicon.ico"))


if __name__ == "__main__":
    main()
