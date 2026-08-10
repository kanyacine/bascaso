"use client";

import { useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandItem, CommandInput, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ALL_FONTS, POPULAR_FONTS, SYSTEM_FONTS } from "@/lib/screenshot-editor/font-catalog";
import { fontFamilyName, fontValueForFamily, isSystemFont } from "@/lib/screenshot-editor/fonts";
import { loadEditorFont } from "@/lib/hooks/use-editor-fonts";
import { useTranslations } from "@/lib/i18n/locale-context";

const LIST_CAP = 100; // appscreen caps at 100 too (app.js:1098) – no virtualization needed
type Category = "popular" | "system" | "all";

export function FontPicker({ value, onChange }: { value: string; onChange: (cssValue: string) => void }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("popular");
  const [search, setSearch] = useState("");

  const names =
    category === "system" ? SYSTEM_FONTS.map((f) => f.name)
    : category === "popular" ? POPULAR_FONTS
    : [...SYSTEM_FONTS.map((f) => f.name), ...ALL_FONTS];
  const query = search.trim().toLowerCase();
  const filtered = (query ? names.filter((n) => n.toLowerCase().includes(query)) : names).slice(0, LIST_CAP);
  const current = fontFamilyName(value);

  const pick = (name: string) => {
    void loadEditorFont(name); // fire and forget – the canvas redraws via useEditorFonts
    onChange(fontValueForFamily(name));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
                         onValueChange={(v) => v && setCategory(v as Category)}>
              <ToggleGroupItem value="popular" className="h-6 flex-1 text-xs">
                {t("screenshotEditor.fontsPopular")}
              </ToggleGroupItem>
              <ToggleGroupItem value="system" className="h-6 flex-1 text-xs">
                {t("screenshotEditor.fontsSystem")}
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="h-6 flex-1 text-xs">
                {t("screenshotEditor.fontsAll")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <CommandList>
            <CommandEmpty>{t("screenshotEditor.noFontsFound")}</CommandEmpty>
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
