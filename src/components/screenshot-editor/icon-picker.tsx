"use client";

import { useState } from "react";
import { SquaresFour } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ICON_CATALOG } from "./icon-catalog";
import { useTranslations } from "@/lib/i18n/locale-context";

export function IconPicker({ onPick }: { onPick: (name: string) => void }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = ICON_CATALOG.filter((i) => i.name.includes(q));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("screenshotEditor.addIcon")}>
          <SquaresFour size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
               placeholder={t("screenshotEditor.searchIcons")} className="mb-2" />
        <div className="grid max-h-52 grid-cols-6 gap-0.5 overflow-y-auto">
          {results.map(({ name, Icon }) => (
            <button key={name} type="button" title={name}
                    className="flex items-center justify-center rounded p-2 hover:bg-accent"
                    onClick={() => { onPick(name); setOpen(false); }}>
              <Icon size={20} />
            </button>
          ))}
          {results.length === 0 ? (
            <p className="col-span-6 py-4 text-center text-sm text-muted-foreground">
              {t("screenshotEditor.noResults")}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
