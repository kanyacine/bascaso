/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// Pure font-name plumbing shared by the picker, the DOM loader hook and the export loop.
// Stored values are full CSS font-family stacks (appscreen convention), not bare names.
import { SYSTEM_FONTS } from "./font-catalog";
import type { ScreenshotDoc } from "./types";

const FALLBACK_NAME = "SF Pro Display";
const CSS2_WEIGHTS = "300;400;500;600;700;800;900";

/**
 * Families installed on this machine, filled once by loadDeviceFonts() (use-editor-fonts.ts).
 * They count as system fonts: the picker offers them and nothing tries to fetch them from Google.
 */
const deviceFonts = new Set<string>();

export function registerDeviceFonts(families: string[]): void {
  for (const family of families) deviceFonts.add(family);
}

/** Curated first – they carry the CSS stacks, and macOS hides the SF faces from the API – then
 *  everything else the machine has. */
export function systemFontNames(device: string[] = []): string[] {
  const curated = SYSTEM_FONTS.map((f) => f.name);
  return [...curated, ...device.filter((f) => !curated.includes(f)).sort()];
}

export function isSystemFont(name: string): boolean {
  return SYSTEM_FONTS.some((f) => f.name === name) || deviceFonts.has(name);
}

/** Name → stored CSS value. Google families get the appscreen synthetic stack (app.js:1072). */
export function fontValueForFamily(name: string): string {
  return SYSTEM_FONTS.find((f) => f.name === name)?.value ?? `'${name}', sans-serif`;
}

/** Stored CSS value → display name (reverse of appscreen's `/'([^']+)'/` at app.js:1199). */
export function fontFamilyName(cssValue: string): string {
  const system = SYSTEM_FONTS.find((f) => f.value === cssValue);
  if (system) return system.name;
  const quoted = /'([^']+)'/.exec(cssValue);
  return quoted ? quoted[1] : FALLBACK_NAME;
}

export function googleFontCss2Url(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${CSS2_WEIGHTS}&display=swap`;
}

/** Every non-system family the doc's canvas text can use – the set to load before drawing. */
export function collectFontFamilies(doc: ScreenshotDoc): string[] {
  const families = new Set<string>();
  const add = (cssValue: string | undefined) => {
    if (!cssValue) return;
    const name = fontFamilyName(cssValue);
    if (!isSystemFont(name)) families.add(name);
  };
  for (const shot of doc.screenshots) {
    add(shot.text.headlineFont);
    add(shot.text.subheadlineFont);
    for (const el of shot.elements) add(el.font);
  }
  return [...families].sort();
}
