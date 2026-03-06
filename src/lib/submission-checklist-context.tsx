"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";

export type FieldStatus = "ok" | "warn" | "missing";

export interface FieldIssues {
  status: FieldStatus;
  localesWithIssues: string[];
}

/** Fields reported by the store listing page. */
export interface StoreListingFlags {
  description: FieldIssues;
  whatsNew: FieldIssues;
  keywords: FieldIssues;
  supportUrl: FieldIssues;
}

/** Fields reported by the app details page. */
export interface AppDetailsFlags {
  name: FieldIssues;
  privacyPolicyUrl: FieldIssues;
}

export interface ChecklistFlags {
  storeListing: StoreListingFlags | null;
  appDetails: AppDetailsFlags | null;
  hasScreenshots: boolean | null;
}

interface SubmissionChecklistContextValue {
  flags: ChecklistFlags;
  reportStoreListing: (flags: StoreListingFlags) => void;
  reportAppDetails: (flags: AppDetailsFlags) => void;
  reportScreenshots: (has: boolean) => void;
}

const SubmissionChecklistContext = createContext<SubmissionChecklistContextValue>({
  flags: { storeListing: null, appDetails: null, hasScreenshots: null },
  reportStoreListing: () => {},
  reportAppDetails: () => {},
  reportScreenshots: () => {},
});

export function SubmissionChecklistProvider({ children }: { children: React.ReactNode }) {
  const [storeListing, setStoreListing] = useState<StoreListingFlags | null>(null);
  const [appDetails, setAppDetails] = useState<AppDetailsFlags | null>(null);
  const [hasScreenshots, setHasScreenshots] = useState<boolean | null>(null);

  const reportStoreListing = useCallback((f: StoreListingFlags) => setStoreListing(f), []);
  const reportAppDetails = useCallback((f: AppDetailsFlags) => setAppDetails(f), []);
  const reportScreenshots = useCallback((has: boolean) => setHasScreenshots(has), []);

  const value = useMemo(() => ({
    flags: { storeListing, appDetails, hasScreenshots },
    reportStoreListing,
    reportAppDetails,
    reportScreenshots,
  }), [storeListing, appDetails, hasScreenshots, reportStoreListing, reportAppDetails, reportScreenshots]);

  return (
    <SubmissionChecklistContext.Provider value={value}>
      {children}
    </SubmissionChecklistContext.Provider>
  );
}

export function useSubmissionChecklist() {
  return useContext(SubmissionChecklistContext);
}
