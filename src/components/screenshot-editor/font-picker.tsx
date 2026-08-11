"use client";

import { useEffect, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandItem, CommandInput, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ONLINE_FONTS } from "@/lib/screenshot-editor/font-catalog";
import {
  fontFamilyName, fontValueForFamily, isSystemFont, systemFontNames,
} from "@/lib/screenshot-editor/fonts";
import { pushRecentFont, readRecentFonts } from "@/lib/screenshot-editor/recent-fonts";
import { loadDeviceFonts, loadEditorFont, useGoogleFontsAllowed } from "@/lib/hooks/use-editor-fonts";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";

const LIST_CAP = 100; // appscreen caps at 100 too (app.js:1098) – no virtualization needed
type Category = "recent" | "system" | "online";

export function FontPicker({ value, onChange }: { value: string; onChange: (cssValue: string) => void }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  // Every family installed on this machine, once the API has answered. Until then – and in a
  // browser that refuses – systemFontNames() is just the curated ten.
  const [deviceFonts, setDeviceFonts] = useState<string[]>([]);
  // The online catalog is a download from Google, so it is offered only once that is allowed.
  const online = useGoogleFontsAllowed();

  useEffect(() => { void loadDeviceFonts().then(setDeviceFonts); }, []);

  // Nothing picked yet, or the online tab disappeared under the user – fall back to the machine.
  const [chosen, setChosen] = useState<Category | null>(null);
  const category: Category =
    chosen === "online" && !online ? "system"
    : chosen ?? (recent.length > 0 ? "recent" : "system");

  const system = systemFontNames(deviceFonts);
  const names = category === "system" ? system : category === "recent" ? recent : ONLINE_FONTS;
  const query = search.trim().toLowerCase();
  // The online catalog is the only list long enough to need a cap – never truncate the other two.
  const cap = category === "online" ? LIST_CAP : Infinity;
  const filtered = (query ? names.filter((n) => n.toLowerCase().includes(query)) : names).slice(0, cap);
  const current = fontFamilyName(value);

  const tabs: { value: Category; key: MessageKey }[] = [
    { value: "recent", key: "screenshotEditor.fontsRecent" },
    { value: "system", key: "screenshotEditor.fontsSystem" },
    ...(online ? [{ value: "online" as const, key: "screenshotEditor.fontsOnline" as const }] : []),
  ];

  const pick = (name: string) => {
    void loadEditorFont(name); // fire and forget – the canvas redraws via useEditorFonts
    setRecent(pushRecentFont(name));
    onChange(fontValueForFamily(name));
    setOpen(false);
  };

  return (
    // Re-read on open: another picker in the panel may have added to the list since.
    <Popover open={open} onOpenChange={(o) => { if (o) setRecent(readRecentFonts()); setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 w-40 justify-between px-2.5 text-sm font-normal">
          <span className="truncate">{current}</span>
          <CaretDown size={12} className="shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("screenshotEditor.searchFonts")} value={search} onValueChange={setSearch} />
          <div className="border-b p-1">
            <ToggleGroup type="single" value={category} className="w-full"
                         onValueChange={(v) => v && setChosen(v as Category)}>
              {tabs.map((tab) => (
                <ToggleGroupItem key={tab.value} value={tab.value} className="h-6 flex-1 text-xs">
                  {t(tab.key)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <CommandList>
            <CommandEmpty>
              {category === "recent" && recent.length === 0
                ? t("screenshotEditor.noRecentFonts")
                : t("screenshotEditor.noFontsFound")}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((name) => (
                <CommandItem key={name} value={name} onSelect={() => pick(name)}>
                  {name === current ? <Check size={14} /> : <span className="w-[14px]" />}
                  <span style={{ fontFamily: isSystemFont(name) ? fontValueForFamily(name) : `'${name}'` }}>
                    {name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
