"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type ReviewViewMode = "changes" | "before" | "after";

interface ReviewChangesContextValue {
  mode: ReviewViewMode;
  setMode: (m: ReviewViewMode) => void;
  localeFilter: string;
  setLocaleFilter: (l: string) => void;
  sectionFilter: string;
  setSectionFilter: (s: string) => void;
}

const ReviewChangesContext = createContext<ReviewChangesContextValue>({
  mode: "changes",
  setMode: () => {},
  localeFilter: "all",
  setLocaleFilter: () => {},
  sectionFilter: "all",
  setSectionFilter: () => {},
});

export function useReviewChanges() {
  return useContext(ReviewChangesContext);
}

export function ReviewChangesProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ReviewViewMode>("changes");
  const [localeFilter, setLocaleFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  return (
    <ReviewChangesContext.Provider value={{ mode, setMode, localeFilter, setLocaleFilter, sectionFilter, setSectionFilter }}>
      {children}
    </ReviewChangesContext.Provider>
  );
}
