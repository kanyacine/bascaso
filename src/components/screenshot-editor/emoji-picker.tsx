"use client";

import { useState } from "react";
import { Smiley } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconTooltip } from "./panel-controls";
import { searchEmoji } from "@/lib/screenshot-editor/emoji-data";
import { useTranslations } from "@/lib/i18n/locale-context";

export function EmojiPicker({ onPick }: { onPick: (emoji: string, name: string) => void }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = searchEmoji(query);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("screenshotEditor.addEmoji")}>
          <IconTooltip label={t("screenshotEditor.addEmoji")}><Smiley size={16} /></IconTooltip>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
               placeholder={t("screenshotEditor.searchEmoji")} className="mb-2" />
        <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
          {results.map((e) => (
            <button key={e.emoji} type="button" title={e.name}
                    className="rounded p-1 text-xl hover:bg-accent"
                    onClick={() => { onPick(e.emoji, e.name); setOpen(false); }}>
              {e.emoji}
            </button>
          ))}
          {results.length === 0 ? (
            <p className="col-span-8 py-4 text-center text-sm text-muted-foreground">
              {t("screenshotEditor.noResults")}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
