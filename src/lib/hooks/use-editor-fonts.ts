"use client";

// Google Fonts DOM loading (port of loadGoogleFont, app.js:646-705) – <link> injection awaited,
// then document.fonts.load for every weight the canvas can ask for. Promise-deduped (appscreen
// polled with setTimeout instead). Lives in hooks/ – DOM side effects, excluded from coverage.
import { useEffect, useState } from "react";
import { collectFontFamilies, googleFontCss2Url, isSystemFont } from "@/lib/screenshot-editor/fonts";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

const WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"];
const inFlight = new Map<string, Promise<void>>();
const ready = new Set<string>();

export function loadEditorFont(family: string): Promise<void> {
  if (isSystemFont(family) || ready.has(family)) return Promise.resolve();
  const existing = inFlight.get(family);
  if (existing) return existing;
  const promise = (async () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = googleFontCss2Url(family);
    await new Promise<void>((resolve, reject) => {
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`font stylesheet failed: ${family}`));
      document.head.appendChild(link);
    });
    await Promise.all(WEIGHTS.map((w) => document.fonts.load(`${w} 16px "${family}"`)));
    ready.add(family);
  })();
  inFlight.set(family, promise);
  promise.catch(() => inFlight.delete(family)); // offline now – retry on a later gesture
  return promise;
}

/** Load every family the doc uses; the returned counter bumps when one becomes ready. */
export function useEditorFonts(doc: ScreenshotDoc | null): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    for (const family of collectFontFamilies(doc)) {
      if (ready.has(family)) continue;
      loadEditorFont(family).then(
        () => { if (!cancelled) setVersion((v) => v + 1); },
        () => {}, // canvas falls back to the next family in the CSS stack (appscreen behavior)
      );
    }
    return () => { cancelled = true; };
  }, [doc]);
  return version;
}
