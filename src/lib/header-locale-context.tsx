"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SectionName } from "./section-locales-context";

export interface HeaderLocaleConfig {
  locales: string[];
  selectedLocale: string;
  primaryLocale: string;
  section: SectionName;
  otherSectionLocales?: Partial<Record<SectionName, string[]>>;
  availableLocales?: string[];
  readOnly?: boolean;
  onLocaleChange: (code: string) => void;
  onLocaleAdd?: (code: string) => void;
  onLocalesAdd?: (codes: string[]) => void;
  onLocaleDelete?: (code: string) => void;
  onBulkTranslate?: () => void;
  onBulkCopy?: () => void;
  onBulkTranslateAll?: () => void;
  onBulkCopyAll?: () => void;
  localesWithContent?: Set<string>;
}

interface HeaderLocaleContextValue {
  /** Ref used by pages to keep handlers fresh without triggering re-renders */
  configRef: React.RefObject<HeaderLocaleConfig | null>;
  /** Snapshot of the config for render-safe reading by the header */
  config: HeaderLocaleConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<HeaderLocaleConfig | null>>;
}

const HeaderLocaleContext = createContext<HeaderLocaleContextValue>({
  configRef: { current: null },
  config: null,
  setConfig: () => {},
});

export function HeaderLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const configRef = useRef<HeaderLocaleConfig | null>(null);
  const [config, setConfig] = useState<HeaderLocaleConfig | null>(null);

  return (
    <HeaderLocaleContext.Provider value={{ configRef, config, setConfig }}>
      {children}
    </HeaderLocaleContext.Provider>
  );
}

/**
 * Pages call this to register their locale picker state with the header.
 * Handlers are kept fresh via a ref; display data changes trigger header re-render.
 */
export function useRegisterHeaderLocale(config: HeaderLocaleConfig) {
  const { configRef, setConfig } = useContext(HeaderLocaleContext);

  useEffect(() => {
    const prev = configRef.current;
    configRef.current = config;

    // Only bump config (trigger header re-render) when display data changes
    if (
      !prev ||
      prev.selectedLocale !== config.selectedLocale ||
      prev.locales !== config.locales ||
      prev.primaryLocale !== config.primaryLocale ||
      prev.readOnly !== config.readOnly ||
      prev.section !== config.section ||
      prev.availableLocales !== config.availableLocales ||
      prev.localesWithContent !== config.localesWithContent
    ) {
      setConfig(config);
    }
  });

  // Unregister on unmount – only if still owned by this section
  const section = config.section;
  useEffect(() => {
    return () => {
      if (configRef.current?.section === section) {
        configRef.current = null;
        setConfig(null);
      }
    };
  }, [configRef, setConfig, section]);
}

/** Header reads the current locale picker config (render-safe). */
export function useHeaderLocale() {
  const { configRef, config } = useContext(HeaderLocaleContext);
  return { configRef, config };
}
