#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generateur de l'icone Bascaso.

Produit, a partir d'une seule source vectorielle decrite ici :
  - bascaso-icon.svg          la source vectorielle
  - bascaso.iconset/          les 10 tailles attendues par macOS
  - ../../public/icon.png     1024x1024, utilise par Electron et la page "A propos"
  - ../../public/icon.icns    le bundle d'icones consomme par electron-forge
  - ../../src/app/favicon.ico le favicon multi-resolutions du front Next.js

Usage :  python3 generate-icon.py
Dependances : pip install cairosvg pillow

Le dessin : la boite d'Itsyconnect (couvercle + corps) sert de corps a une
chouette dont les aigrettes sont integrees a la forme meme du couvercle, avec
les yeux et le bec herites du hibou RespectASO.
"""
import math
import os
import struct
import sys

CANVAS = 1024
HALF = 412           # demi-cote du squircle (ratio Apple : 824/1024)
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

BODY_RADIUS = 24     # arrondi du corps : volontairement cubique, esprit Itsyconnect


# ------------------------------------------------------------------- geometrie
def squircle(a=HALF, cx=CENTER, cy=CENTER, n=5.0, steps=720):
    """Superellipse d'exposant 5 : approxime le squircle des icones Apple."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + a * math.copysign(abs(c) ** (2 / n), c),
                    cy + a * math.copysign(abs(s) ** (2 / n), s)))
    return "M %.2f %.2f " % pts[0] + " ".join("L %.2f %.2f" % p for p in pts[1:]) + " Z"


def symmetric_lid(left_half, x_join, bottom_left, bottom=416):
    """Construit le couvercle a partir de sa seule moitie gauche.

    left_half est une liste de cubiques (c1x, c1y, c2x, c2y, px, py) partant de
    (bottom_left, bottom) et arrivant sur (x_join, 304). La moitie droite est
    obtenue par miroir + inversion de chaque cubique, ce qui garantit une
    symetrie exacte plutot qu'approchee a la main.
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
    """Couvercle + aigrettes en une seule silhouette continue.

    Les deux pointes de chaque cote filent vers l'exterieur en diagonale et sont
    separees par un sillon fin : c'est le geste des aigrettes de RespectASO,
    greffe sur le couvercle de la boite Itsyconnect.

    Le couvercle est quasiment affleurant au corps (bord a 252 contre 256 pour le
    corps, soit 4 px de debord) : un couvercle plus large ecrase la chouette.
    """
    k = radius * 0.45
    return symmetric_lid([
        (252 + k, 416, 252, 416 - k, 252, 416 - radius),   # coin bas gauche
        (250, 372, 230, 292, 196, 248),                    # pointe exterieure
        (216, 272, 244, 300, 272, 312),                    # sillon
        (268, 302, 258, 282, 246, 272),                    # pointe interieure
        (258, 284, 280, 302, 304, 304),                    # retour au plat
        (320, 304, 320, 304, 332, 304),                    # raccord
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
    """Serres triangulaires, base large et pointe emoussee."""
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


# ------------------------------------------------------------------------ sortie
ICONSET = [(16, "icon_16x16"), (32, "icon_16x16@2x"), (32, "icon_32x32"),
           (64, "icon_32x32@2x"), (128, "icon_128x128"), (256, "icon_128x128@2x"),
           (256, "icon_256x256"), (512, "icon_256x256@2x"), (512, "icon_512x512"),
           (1024, "icon_512x512@2x")]

# Meme table de types que l'icone Itsyconnect d'origine, pour ne rien perdre
# en compatibilite selon les contextes d'affichage de macOS.
ICNS_TYPES = [(b"ic04", 16), (b"ic05", 32), (b"ic07", 128), (b"ic08", 256),
              (b"ic09", 512), (b"ic10", 1024), (b"ic11", 32), (b"ic12", 64),
              (b"ic13", 256), (b"ic14", 512)]


def main():
    try:
        import cairosvg
        from PIL import Image
    except ImportError:
        sys.exit("Dependances manquantes : pip install cairosvg pillow")

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

    print("icone regeneree :")
    print("  " + svg_path)
    print("  " + iconset)
    print("  " + icon_png)
    print("  " + os.path.join(REPO, "public", "icon.icns"))
    print("  " + os.path.join(REPO, "src", "app", "favicon.ico"))


if __name__ == "__main__":
    main()
