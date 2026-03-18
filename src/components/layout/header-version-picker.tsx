"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useParams,
  usePathname,
  useSearchParams,
  useRouter,
} from "next/navigation";
import { ArrowsClockwise, CaretDown, Check, Plus, Trash, CloudArrowUp } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { usePreReleaseVersions } from "@/lib/pre-release-versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useChangeBuffer } from "@/lib/change-buffer-context";
import { useReviewChanges, type ReviewViewMode } from "@/lib/review-changes-context";
import { useRefresh } from "@/lib/refresh-context";
import { localeName, sortLocales } from "@/lib/asc/locale-names";
import {
  getVersionPlatforms,
  getVersionsByPlatform,
  resolveVersion,
  getPreReleasePlatforms,
  getPreReleasesByPlatform,
  resolvePreReleaseVersion,
  stateLabel,
  isValidVersionString,
  hasInvalidVersionChars,
  EDITABLE_STATES,
  PLATFORM_LABELS,
  STATE_DOT_COLORS,
  type AscVersion,
} from "@/lib/asc/version-types";

const VERSION_PAGES = new Set(["store-listing", "screenshots", "review", "testflight", "aso"]);
const SAVE_PAGES = new Set(["details", "store-listing", "review", "aso", "nominations"]);
const OVERVIEW_PAGE = "";

const LIVE_STATES = new Set([
  "READY_FOR_SALE",
  "READY_FOR_DISTRIBUTION",
  "ACCEPTED",
]);

/** All non-live versions + only the most recent live version. */
function filterPickerVersions(versions: AscVersion[]): AscVersion[] {
  let foundLive = false;
  return versions.filter((v) => {
    if (!LIVE_STATES.has(v.attributes.appVersionState)) return true;
    if (!foundLive) { foundLive = true; return true; }
    return false;
  });
}

export function HeaderVersionPicker() {
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { versions, refresh } = useVersions();
  const { versions: preReleaseVersions } = usePreReleaseVersions();
  const { guardNavigation } = useFormDirty();

  const [platformPickerOpen, setPlatformPickerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [versionString, setVersionString] = useState("");
  const [platform, setPlatform] = useState("");
  const [creating, setCreating] = useState(false);

  if (!appId) return null;

  const subpath = pathname
    .replace(`/dashboard/apps/${appId}`, "")
    .replace(/^\//, "");
  const pageSegment = subpath.split("/")[0];

  // Show on testflight root (builds list) and group detail pages
  const isTestFlight = subpath === "testflight" || /^testflight\/groups\/[^/]+$/.test(subpath);
  if (!VERSION_PAGES.has(pageSegment) && !isTestFlight) return null;
  if (pageSegment === "testflight" && !isTestFlight) return null;

  // Hide "New version/platform" on pages that only browse versions
  const showCreateActions = !isTestFlight && pageSegment !== "aso";

  const versionParam = searchParams.get("version");

  // Branch data source based on TestFlight vs App Store
  const platforms = isTestFlight
    ? getPreReleasePlatforms(preReleaseVersions)
    : getVersionPlatforms(versions);

  const selectedVersion = isTestFlight ? undefined : resolveVersion(versions, versionParam);
  const selectedPreRelease = isTestFlight ? resolvePreReleaseVersion(preReleaseVersions, versionParam) : undefined;

  const currentPlatform = isTestFlight
    ? (selectedPreRelease?.platform ?? platforms[0] ?? "IOS")
    : (selectedVersion?.attributes.platform ?? platforms[0] ?? "IOS");

  const platformVersions = isTestFlight
    ? getPreReleasesByPlatform(preReleaseVersions, currentPlatform)
    : filterPickerVersions(getVersionsByPlatform(versions, currentPlatform));

  function navigate(versionId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("version", versionId);
    const url = `${pathname}?${params.toString()}`;
    guardNavigation(() => router.replace(url));
  }

  function handlePlatformChange(newPlatform: string) {
    if (isTestFlight) {
      const pvs = getPreReleasesByPlatform(preReleaseVersions, newPlatform);
      if (pvs.length > 0) navigate(pvs[0].id);
    } else {
      const pvs = getVersionsByPlatform(versions, newPlatform);
      if (pvs.length > 0) navigate(pvs[0].id);
    }
  }

  function openDialog() {
    setVersionString("");
    setPlatform(currentPlatform);
    setDialogOpen(true);
  }

  const trimmedVersion = versionString.trim();
  const versionValid = trimmedVersion !== "" && isValidVersionString(trimmedVersion);

  async function handleCreate() {
    if (!versionValid || !platform) return;
    setCreating(true);
    try {
      const data = await apiFetch<{ versionId: string }>(`/api/apps/${appId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionString: trimmedVersion, platform }),
      });
      setDialogOpen(false);
      await refresh();
      router.push(`/dashboard/apps/${appId}/store-listing?version=${data.versionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create version");
    } finally {
      setCreating(false);
    }
  }

  // Display values for the version trigger button
  const triggerVersionString = isTestFlight
    ? (selectedPreRelease?.version ?? "–")
    : (selectedVersion?.attributes.versionString ?? "–");
  const selectedId = isTestFlight ? selectedPreRelease?.id : selectedVersion?.id;

  return (
    <>
      <Separator orientation="vertical" className="mx-2 !h-4" />
      <Popover open={platformPickerOpen} onOpenChange={setPlatformPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-sm">
            {PLATFORM_LABELS[currentPlatform] ?? currentPlatform}
            <CaretDown size={12} className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                {platforms.map((p) => (
                  <CommandItem
                    key={p}
                    value={PLATFORM_LABELS[p] ?? p}
                    onSelect={() => {
                      handlePlatformChange(p);
                      setPlatformPickerOpen(false);
                    }}
                  >
                    {p === currentPlatform && (
                      <Check size={14} className="text-foreground" />
                    )}
                    <span className={p !== currentPlatform ? "pl-[22px]" : ""}>
                      {PLATFORM_LABELS[p] ?? p}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {showCreateActions && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setPlatformPickerOpen(false);
                        guardNavigation(openDialog);
                      }}
                    >
                      <Plus size={14} className="text-muted-foreground" />
                      {"New platform\u2026"}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 gap-1.5 px-2.5 font-mono text-sm">
            {triggerVersionString}
            {!isTestFlight && selectedVersion && (
              <span
                className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[selectedVersion.attributes.appVersionState] ?? "bg-muted-foreground"}`}
              />
            )}
            <CaretDown size={12} className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandList>
              <CommandEmpty>No versions found.</CommandEmpty>
              <CommandGroup>
                {isTestFlight
                  ? (platformVersions as ReturnType<typeof getPreReleasesByPlatform>).map((v) => (
                      <CommandItem
                        key={v.id}
                        value={v.version}
                        onSelect={() => {
                          navigate(v.id);
                          setPickerOpen(false);
                        }}
                      >
                        {v.id === selectedId && (
                          <Check size={14} className="text-foreground" />
                        )}
                        <span className={`font-mono ${v.id !== selectedId ? "pl-[22px]" : ""}`}>
                          {v.version}
                        </span>
                      </CommandItem>
                    ))
                  : (platformVersions as AscVersion[]).map((v) => (
                      <CommandItem
                        key={v.id}
                        value={`${v.attributes.versionString} ${stateLabel(v.attributes.appVersionState)}`}
                        onSelect={() => {
                          navigate(v.id);
                          setPickerOpen(false);
                        }}
                      >
                        {v.id === selectedId && (
                          <Check size={14} className="text-foreground" />
                        )}
                        <span className={`font-mono ${v.id !== selectedId ? "pl-[22px]" : ""}`}>
                          {v.attributes.versionString}
                        </span>
                        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[v.attributes.appVersionState] ?? "bg-muted-foreground"}`}
                          />
                          {stateLabel(v.attributes.appVersionState)}
                        </span>
                      </CommandItem>
                    ))}
              </CommandGroup>
              {showCreateActions && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setPickerOpen(false);
                        guardNavigation(openDialog);
                      }}
                    >
                      <Plus size={14} className="text-muted-foreground" />
                      {"New version\u2026"}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showCreateActions && (
        <CreateVersionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          versionString={versionString}
          onVersionStringChange={setVersionString}
          platform={platform}
          onPlatformChange={setPlatform}
          creating={creating}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}

export function HeaderVersionActions() {
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { versions, refresh } = useVersions();
  const { isDirty, isSaving, onSave, onDiscard, guardNavigation } = useFormDirty();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [versionString, setVersionString] = useState("");
  const [platform, setPlatform] = useState("");
  const [creating, setCreating] = useState(false);

  const platforms = getVersionPlatforms(versions);

  // Cmd+S / Ctrl+S to save
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && isDirty && !isSaving) {
        e.preventDefault();
        onSave();
      }
    },
    [isDirty, isSaving, onSave],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!appId) return null;

  const pageSegment = pathname
    .replace(`/dashboard/apps/${appId}`, "")
    .replace(/^\//, "")
    .split("/")[0];

  if (pageSegment === "review-changes") {
    return <HeaderReviewChangesActions appId={appId} />;
  }

  // Show save/discard on dedicated save pages, or any page that marked
  // the form dirty (e.g. testflight build detail editing "what's new").
  const showSave = SAVE_PAGES.has(pageSegment) || isDirty;
  const showNewVersion = pageSegment === OVERVIEW_PAGE;

  if (!showSave && !showNewVersion) return null;

  const selectedVersion = resolveVersion(versions, searchParams.get("version"));
  const currentPlatform = selectedVersion?.attributes.platform ?? platforms[0] ?? "IOS";
  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : true;

  function openDialog() {
    setVersionString("");
    setPlatform(currentPlatform);
    setDialogOpen(true);
  }

  const trimmedVersion = versionString.trim();
  const versionValid = trimmedVersion !== "" && isValidVersionString(trimmedVersion);

  async function handleCreate() {
    if (!versionValid || !platform) return;
    setCreating(true);
    try {
      const data = await apiFetch<{ versionId: string }>(`/api/apps/${appId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionString: trimmedVersion, platform }),
      });
      setDialogOpen(false);
      await refresh();
      router.push(`/dashboard/apps/${appId}/store-listing?version=${data.versionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create version");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {showNewVersion && (
        <Button
          size="sm"
          className="h-8 gap-1 text-sm"
          onClick={() => guardNavigation(openDialog)}
        >
          <Plus size={14} />
          New version
        </Button>
      )}
      {showSave && isDirty && !isSaving && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-sm"
          onClick={onDiscard}
        >
          Discard
        </Button>
      )}
      {showSave && (!readOnly || isDirty) && (
        <Button
          size="sm"
          className="h-8 gap-1 text-sm"
          disabled={!isDirty || isSaving}
          onClick={onSave}
        >
          {isSaving && <Spinner className="size-3.5" />}
          {isSaving ? "Saving\u2026" : pageSegment === "nominations" ? "Save draft" : "Save"}
          {!isSaving && (
            <kbd className="ml-1 text-[10px] opacity-50 font-sans">&#8984;S</kbd>
          )}
        </Button>
      )}

      {showNewVersion && (
        <CreateVersionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          versionString={versionString}
          onVersionStringChange={setVersionString}
          platform={platform}
          onPlatformChange={setPlatform}
          creating={creating}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}

const REVIEW_SECTION_LABELS: Record<string, string> = {
  "store-listing": "Store listing",
  details: "App details",
  keywords: "Keywords",
  review: "App review",
};

/** Left-side filters for the review-changes page (renders next to breadcrumb). */
export function HeaderReviewFilters() {
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const { changes, bufferEnabled } = useChangeBuffer();
  const { apps } = useApps();
  const { mode, setMode, sectionFilter, setSectionFilter, localeFilter, setLocaleFilter } = useReviewChanges();
  const [sectionOpen, setSectionOpen] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);

  if (!appId) return null;
  const pageSegment = pathname.replace(`/dashboard/apps/${appId}`, "").replace(/^\//, "").split("/")[0];
  if (pageSegment !== "review-changes") return null;

  const primaryLocale = apps.find((a) => a.id === appId)?.primaryLocale ?? "";
  const appChanges = changes.filter((c) => c.appId === appId);
  if (appChanges.length === 0) return null;

  const allSections = [...new Set(appChanges.map((c) => c.section))].sort();
  const localeSet = new Set<string>();
  for (const c of appChanges) {
    const dl = c.data.locales as Record<string, unknown> | undefined;
    if (dl) for (const l of Object.keys(dl)) localeSet.add(l);
  }
  const allLocales = sortLocales([...localeSet], primaryLocale);

  return (
    <>
      <div className="inline-flex rounded-md border bg-muted/50 p-0.5">
        {(["changes", "before", "after"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v)}
            className={`rounded-sm px-2.5 py-1 text-sm font-medium transition-colors ${
              mode === v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v === "changes" ? "Diff" : v === "before" ? "Current" : "Updated"}
          </button>
        ))}
      </div>
      <Separator orientation="vertical" className="mx-2 !h-4" />
      <Popover open={sectionOpen} onOpenChange={setSectionOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-sm">
            {sectionFilter === "all" ? "All sections" : REVIEW_SECTION_LABELS[sectionFilter] ?? sectionFilter}
            <CaretDown size={12} className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                <CommandItem value="all" onSelect={() => { setSectionFilter("all"); setSectionOpen(false); }}>
                  <Check size={14} className={sectionFilter === "all" ? "opacity-100" : "opacity-0"} />
                  All sections
                </CommandItem>
                {allSections.map((s) => (
                  <CommandItem key={s} value={s} onSelect={() => { setSectionFilter(s); setSectionOpen(false); }}>
                    <Check size={14} className={sectionFilter === s ? "opacity-100" : "opacity-0"} />
                    {REVIEW_SECTION_LABELS[s] ?? s}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Popover open={localeOpen} onOpenChange={setLocaleOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-sm">
            {localeFilter === "all" ? "All locales" : localeName(localeFilter)}
            {localeFilter !== "all" && <span className="text-muted-foreground">{localeFilter}</span>}
            <CaretDown size={12} className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search locales..." />
            <CommandList>
              <CommandEmpty>No locale found.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="all" onSelect={() => { setLocaleFilter("all"); setLocaleOpen(false); }}>
                  <Check size={14} className={localeFilter === "all" ? "opacity-100" : "opacity-0"} />
                  All locales
                </CommandItem>
                {allLocales.map((loc) => (
                  <CommandItem key={loc} value={`${localeName(loc)} ${loc}`} onSelect={() => { setLocaleFilter(loc); setLocaleOpen(false); }}>
                    <Check size={14} className={localeFilter === loc ? "opacity-100" : "opacity-0"} />
                    {localeName(loc)}
                    <span className="ml-auto text-muted-foreground">{loc}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

/** Right-side buttons for the review-changes page (renders in actions area). */
function HeaderReviewChangesActions({ appId }: { appId: string }) {
  const { changes, discardAll, publishAll } = useChangeBuffer();
  const [publishing, setPublishing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const appChanges = changes.filter((c) => c.appId === appId);

  async function handlePublish() {
    setPublishing(true);
    try {
      const ok = await publishAll(appId);
      if (ok) {
        toast.success("All changes saved to App Store Connect");
      } else {
        toast.error("Some changes failed to publish – check the remaining items");
      }
    } catch {
      toast.error("Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  if (appChanges.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 text-sm" onClick={() => setConfirmDiscard(true)}>
        Discard all
      </Button>
      <Button size="sm" className="h-8 text-sm" onClick={handlePublish} disabled={publishing}>
        {publishing && <Spinner className="size-3.5 mr-1.5" />}
        Push to App Store Connect
      </Button>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard all changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all pending changes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => discardAll(appId)}>
              Discard all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreateVersionDialog({
  open,
  onOpenChange,
  versionString,
  onVersionStringChange,
  platform,
  onPlatformChange,
  creating,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionString: string;
  onVersionStringChange: (value: string) => void;
  platform: string;
  onPlatformChange: (value: string) => void;
  creating: boolean;
  onSubmit: () => void;
}) {
  const trimmed = versionString.trim();
  const valid = trimmed !== "" && isValidVersionString(trimmed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New App Store version</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="version-string">Version</Label>
            <Input
              id="version-string"
              placeholder="e.g. 1.2.0"
              value={versionString}
              onChange={(e) => onVersionStringChange(e.target.value)}
              className="font-mono"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && platform) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="platform-select">Platform</Label>
            <Select value={platform} onValueChange={onPlatformChange}>
              <SelectTrigger id="platform-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {trimmed !== "" && hasInvalidVersionChars(trimmed) && (
          <p className="text-sm text-destructive">
            Use digits and dots only (e.g. 1.2.0)
          </p>
        )}
        <Button
          onClick={onSubmit}
          disabled={!valid || !platform || creating}
        >
          {creating && <Spinner className="size-3.5" />}
          {creating ? "Creating\u2026" : "Create"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function HeaderRefreshButton() {
  const { appId } = useParams<{ appId?: string }>();
  const { refresh: refreshApps } = useApps();
  const { loading, refresh: refreshVersions } = useVersions();
  const { refresh: refreshPreReleaseVersions } = usePreReleaseVersions();
  const { guardNavigation } = useFormDirty();
  const { busy: sectionBusy, hasHandler, doRefresh: sectionRefresh } = useRefresh();
  const [refreshing, setRefreshing] = useState(false);

  const pathname = usePathname();
  const isReviewChanges = appId && pathname.replace(`/dashboard/apps/${appId}`, "").replace(/^\//, "").startsWith("review-changes");
  if (isReviewChanges) return null;
  if (!appId && !hasHandler) return null;

  async function doDefaultRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      await Promise.all([refreshApps(), refreshVersions(), refreshPreReleaseVersions()]);
    } finally {
      setRefreshing(false);
    }
  }

  const busy = sectionBusy || (appId ? loading : false) || refreshing;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="ml-2 size-8"
      onClick={() => guardNavigation(hasHandler ? sectionRefresh : doDefaultRefresh)}
      disabled={busy}
    >
      <ArrowsClockwise size={14} className={busy ? "animate-spin" : ""} />
    </Button>
  );
}
