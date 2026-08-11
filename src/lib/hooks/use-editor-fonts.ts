"use client";

// Google Fonts DOM loading (port of loadGoogleFont, app.js:646-705) – <link> injection awaited,
// then document.fonts.load for every weight the canvas can ask for. Promise-deduped (appscreen
// polled with setTimeout instead). Lives in hooks/ – DOM side effects, excluded from coverage.
import { useEffect, useState } from "react";
import {
  collectFontFamilies, googleFontCss2Url, isSystemFont, registerDeviceFonts,
} from "@/lib/screenshot-editor/fonts";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

const WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"];
const inFlight = new Map<string, Promise<void>>();
const ready = new Set<string>();

/**
 * Every font family installed on the machine, via the Local Font Access API. Electron answers it
 * without a permission prompt and without a user gesture (checked on Electron 40: 551 faces, 181
 * families); a plain browser would prompt, and a refusal just leaves the curated list in place.
 */
let devicePromise: Promise<string[]> | null = null;

export function loadDeviceFonts(): Promise<string[]> {
  devicePromise ??= (async () => {
    if (typeof window === "undefined" || !window.queryLocalFonts) return [];
    try {
      const faces = await window.queryLocalFonts();
      const families = [...new Set(faces.map((f) => f.family))].sort();
      registerDeviceFonts(families);
      return families;
    } catch {
      devicePromise = null; // denied or unavailable now – a later open may still succeed
      return [];
    }
  })();
  return devicePromise;
}

/**
 * Google downloads are off until the user allows them in the settings (screenshot editor tab).
 * Read synchronously by loadEditorFont; refreshed on every editor mount, since the toggle lives on
 * another page and this module survives the client-side navigation between the two.
 */
let googleAllowed = false;

async function refreshGoogleFontsAllowed(): Promise<boolean> {
  try {
    const res = await fetch("/api/settings/screenshot-editor");
    googleAllowed = res.ok ? Boolean(((await res.json()) as { googleFonts?: boolean }).googleFonts) : false;
  } catch {
    googleAllowed = false;
  }
  return googleAllowed;
}

/** The flag as React state – the picker shows its online tab only while it is on. */
export function useGoogleFontsAllowed(): boolean {
  const [allowed, setAllowed] = useState(googleAllowed);
  useEffect(() => { void refreshGoogleFontsAllowed().then(setAllowed); }, []);
  return allowed;
}

export function loadEditorFont(family: string): Promise<void> {
  if (!googleAllowed || isSystemFont(family) || ready.has(family)) return Promise.resolve();
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
  // Nothing to load before the answer arrives, and the effect re-runs once it flips.
  const allowed = useGoogleFontsAllowed();
  useEffect(() => {
    if (!doc || !allowed) return;
    let cancelled = false;
    for (const family of collectFontFamilies(doc)) {
      if (ready.has(family)) continue;
      loadEditorFont(family).then(
        () => { if (!cancelled) setVersion((v) => v + 1); },
        () => {}, // canvas falls back to the next family in the CSS stack (appscreen behavior)
      );
    }
    return () => { cancelled = true; };
  }, [doc, allowed]);
  return version;
}
