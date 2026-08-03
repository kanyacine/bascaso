# Bascaso icon

The icon tells the story of the two projects Bascaso comes from: the
**Itsyconnect box** (lid + body, corners deliberately cubic) is the body of an
**owl** whose ear tufts, turquoise eyes and diamond beak are inherited from
**RespectASO**.

## Single source

Everything is generated from `generate-icon.py` – there is **no** binary file to
retouch by hand. The SVG itself is an output of the script, not an input.

```bash
pip install cairosvg pillow
python3 design/icon/generate-icon.py
```

The script rewrites:

| File | Role |
| --- | --- |
| `design/icon/bascaso-icon.svg` | readable vector source |
| `design/icon/bascaso.iconset/` | the 10 sizes macOS expects |
| `public/icon.png` | 1024×1024, used by Electron (`electron/main.ts`) and the "About" page |
| `public/icon.icns` | bundle consumed by electron-forge (`forge.config.ts`) |
| `src/app/favicon.ico` | multi-resolution favicon for the Next.js front end |

The `.icns` is assembled directly by the script (no dependency on `iconutil`, so
it can be regenerated from Linux as well as from macOS). It embeds the same type
table as the original icon – `ic04` `ic05` `ic07`–`ic14` – to cover every macOS
display context.

## Drawing constants

| Element | Value |
| --- | --- |
| Canvas | 1024 × 1024 |
| Background | superellipse of exponent 5, half-side 412 (Apple ratio 824/1024) |
| Body corner radius | `BODY_RADIUS = 24` |
| Body purple | `#8B5CF6`, gradient `#A78BFA` → `#6D28D9` |
| Lid purple | `#B79BFF` → `#8B5CF6` |
| Iris turquoise | `#2DD4BF`, gradient `#7FF0DE` → `#0D9488` |
| Ink | `#1E1B4B` |
| Lavender background | `#F1ECFF` → `#D9CBFF` |

## Drawing notes

- **The ear tufts are part of the lid**, not a shape sitting behind it: one
  continuous silhouette, otherwise a stray seam runs across the box.
- The tips are **short and angled outwards diagonally**. Long vertical tufts
  give a "hat" effect; vertical triangles read as cat ears.
- The lid is described **by its left half only** (`symmetric_lid`), the right
  half being obtained by mirroring and reversing the cubics: symmetry is exact
  by construction, not adjusted by hand.
- The rounding of the lid's bottom corners follows that of the body, to avoid a
  soft box sitting on a square base.

## Rendering at small sizes

The eyes stay legible down to 32 px. At 16 px the talons and the groove between
the ear tufts blend together: that is expected, the overall silhouette is enough
to identify the app in the menu bar.
