/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// The 25 gradient presets (index.html:399-427). Kept as the original CSS strings: the swatch paints
// itself with the string and the doc gets the parsed form, so there is one source for both.
import type { GradientStop } from "./types";

export interface GradientPreset {
  label: string;
  css: string;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { label: "Midnight Abyss", css: "linear-gradient(160deg, #0a0a0f 0%, #1a1033 50%, #0d1b2a 100%)" },
  { label: "Obsidian Plum", css: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" },
  { label: "Carbon Slate", css: "linear-gradient(180deg, #1c1c1e 0%, #2c2c2e 100%)" },
  { label: "Steel Blue", css: "linear-gradient(135deg, #29323c 0%, #485563 100%)" },
  { label: "Neon Horizon", css: "linear-gradient(125deg, #0d0221 0%, #711c91 50%, #0abdc6 100%)" },
  { label: "Electric Surge", css: "linear-gradient(135deg, #1a0533 0%, #5b21b6 50%, #06b6d4 100%)" },
  { label: "Synthwave Dusk", css: "linear-gradient(150deg, #2d1b69 0%, #ff2d78 50%, #ff901f 100%)" },
  { label: "Indigo Rush", css: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { label: "Northern Lights", css: "linear-gradient(135deg, #172347 0%, #015268 40%, #0ef3c5 100%)" },
  { label: "Deep Forest", css: "linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
  { label: "Emerald Canopy", css: "linear-gradient(145deg, #134e4a 0%, #065f46 50%, #14532d 100%)" },
  { label: "Ocean Pulse", css: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" },
  { label: "Desert Dusk", css: "linear-gradient(170deg, #c84c28 0%, #d89c60 50%, #bb8a36 100%)" },
  { label: "Ember Glow", css: "linear-gradient(140deg, #7c2d12 0%, #c2410c 50%, #fb923c 100%)" },
  { label: "Mocha Silk", css: "linear-gradient(160deg, #292018 0%, #6b4226 60%, #a07850 100%)" },
  { label: "Golden Hour", css: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)" },
  { label: "Pacific Sunset", css: "linear-gradient(145deg, #f953c6 0%, #b91d73 50%, #4a1942 100%)" },
  { label: "Volcanic Dawn", css: "linear-gradient(130deg, #f12711 0%, #f5af19 100%)" },
  { label: "Deep Ocean", css: "linear-gradient(180deg, #011627 0%, #003459 50%, #007ea7 100%)" },
  { label: "Reef Lagoon", css: "linear-gradient(135deg, #1a6b7c 0%, #40b3c8 50%, #7de8dc 100%)" },
  { label: "Gold Noir", css: "linear-gradient(135deg, #020b13 0%, #1a1200 50%, #c9a227 100%)" },
  { label: "Velvet Noir", css: "linear-gradient(150deg, #1a0000 0%, #400128 50%, #6b0f1a 100%)" },
  { label: "Morning Mist", css: "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)" },
  { label: "Sage Whisper", css: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)" },
  { label: "Royal Navy", css: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)" },
];

/** Port of appscreen's preset click handler (app.js:4199-4218): angle and stops out of the CSS. */
export function parseGradientPreset(css: string): { angle: number; stops: GradientStop[] } | null {
  const angle = /(\d+)deg/.exec(css);
  const stops = [...css.matchAll(/(#[a-fA-F0-9]{6})\s+(\d+)%/g)]
    .map(([, color, position]) => ({ color, position: Number(position) }));
  if (!angle || stops.length < 2) return null;
  return { angle: Number(angle[1]), stops };
}
