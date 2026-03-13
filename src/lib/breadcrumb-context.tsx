"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface BreadcrumbOverrides {
  /** Override the final breadcrumb segment label */
  title: string | null;
  setTitle: (title: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbOverrides | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);

  return (
    <BreadcrumbContext.Provider value={{ title, setTitle }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

/** Read the current breadcrumb title override (for the breadcrumb component). */
export function useBreadcrumbTitle(): string | null {
  const ctx = useContext(BreadcrumbContext);
  return ctx?.title ?? null;
}

/** Set a breadcrumb title from a page. Clears on unmount. */
export function useSetBreadcrumbTitle(title: string | null): void {
  const ctx = useContext(BreadcrumbContext);
  const setTitle = ctx?.setTitle;
  // Update whenever title changes
  useEffect(() => {
    setTitle?.(title);
  }, [setTitle, title]);

  // Clear on unmount
  useEffect(() => {
    return () => setTitle?.(null);
  }, [setTitle]);
}
