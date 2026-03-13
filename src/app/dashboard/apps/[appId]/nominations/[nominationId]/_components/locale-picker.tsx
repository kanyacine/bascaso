"use client";

import { localeName } from "@/lib/asc/locale-names";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { SORTED_LOCALES } from "./nomination-constants";

export function LocalePicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (locales: string[]) => void;
  disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();

  return (
    <section className="space-y-2">
      <h3 className="section-title">Localization</h3>
      <Combobox
        multiple
        autoHighlight
        items={SORTED_LOCALES}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        itemToStringValue={(code: string) =>
          `${localeName(code)} ${code}`
        }
      >
        <ComboboxChips ref={anchor} className="w-full max-w-md">
          <ComboboxValue>
            {(selected: string[]) =>
              selected.map((code) => (
                <ComboboxChip key={code}>
                  {localeName(code)}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No languages found.</ComboboxEmpty>
          <ComboboxList>
            {(code: string) => (
              <ComboboxItem key={code} value={code}>
                {localeName(code)}
                <span className="ml-1.5 text-muted-foreground">{code}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </section>
  );
}
