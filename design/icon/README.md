# Icône Bascaso

L'icône raconte la fusion des deux projets dont Bascaso est issu : la **boîte
d'Itsyconnect** (couvercle + corps, angles volontairement cubiques) sert de corps
à une **chouette**, dont les aigrettes, les yeux turquoise et le bec en losange
sont hérités de **RespectASO**.

## Source unique

Tout est généré depuis `generate-icon.py` — il n'y a **pas** de fichier binaire à
retoucher à la main. Le SVG lui-même est une sortie du script, pas une entrée.

```bash
pip install cairosvg pillow
python3 design/icon/generate-icon.py
```

Le script réécrit :

| Fichier | Rôle |
| --- | --- |
| `design/icon/bascaso-icon.svg` | source vectorielle lisible |
| `design/icon/bascaso.iconset/` | les 10 tailles attendues par macOS |
| `public/icon.png` | 1024×1024, utilisé par Electron (`electron/main.ts`) et la page « À propos » |
| `public/icon.icns` | bundle consommé par electron-forge (`forge.config.ts`) |
| `src/app/favicon.ico` | favicon multi-résolutions du front Next.js |

Le `.icns` est assemblé directement par le script (pas de dépendance à
`iconutil`, donc régénérable depuis Linux comme depuis macOS). Il embarque la
même table de types que l'icône d'origine — `ic04` `ic05` `ic07`–`ic14` — pour
couvrir tous les contextes d'affichage de macOS.

## Constantes de dessin

| Élément | Valeur |
| --- | --- |
| Canvas | 1024 × 1024 |
| Fond | superellipse d'exposant 5, demi-côté 412 (ratio Apple 824/1024) |
| Arrondi du corps | `BODY_RADIUS = 24` |
| Violet corps | `#8B5CF6`, dégradé `#A78BFA` → `#6D28D9` |
| Violet couvercle | `#B79BFF` → `#8B5CF6` |
| Turquoise iris | `#2DD4BF`, dégradé `#7FF0DE` → `#0D9488` |
| Encre | `#1E1B4B` |
| Lavande fond | `#F1ECFF` → `#D9CBFF` |

## Notes de dessin

- **Les aigrettes font partie du couvercle**, pas d'une forme posée derrière :
  une seule silhouette continue, sinon un liseré parasite traverse la boîte.
- Les pointes sont **courtes et orientées vers l'extérieur en diagonale**. Des
  aigrettes longues et verticales donnent un effet « chapeau » ; des triangles
  verticaux se lisent comme des oreilles de chat.
- Le couvercle est décrit **par sa seule moitié gauche** (`symmetric_lid`), la
  droite étant obtenue par miroir et inversion des cubiques : la symétrie est
  exacte par construction, pas ajustée à la main.
- L'arrondi des coins bas du couvercle suit celui du corps, pour éviter une
  boîte molle posée sur un socle carré.

## Rendu aux petites tailles

Les yeux restent lisibles jusqu'à 32 px. À 16 px les serres et le sillon entre
les aigrettes se fondent : c'est attendu, la silhouette générale suffit à
identifier l'app dans la barre de menus.
