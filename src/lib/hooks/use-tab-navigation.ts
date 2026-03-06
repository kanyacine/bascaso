import { useEffect, useRef, type RefObject } from "react";

const SELECTOR = 'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])';

/**
 * Intercept Tab/Shift+Tab within a container to cycle between
 * visible text inputs and textareas only (skipping buttons, selects, etc.).
 */
export function useTabNavigation<T extends HTMLElement = HTMLDivElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const container = ref.current;
      if (!container) return;

      const active = document.activeElement as HTMLElement | null;
      if (!active || !container.contains(active)) return;

      const elements = Array.from(
        container.querySelectorAll<HTMLElement>(SELECTOR),
      ).filter((el) => el.offsetParent !== null);

      const idx = elements.indexOf(active);
      if (idx === -1) return;

      e.preventDefault();
      const next = e.shiftKey
        ? (idx - 1 + elements.length) % elements.length
        : (idx + 1) % elements.length;
      elements[next].focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return ref;
}
