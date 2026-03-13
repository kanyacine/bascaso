"use client";

import { CheckCircle, Circle } from "@phosphor-icons/react";
import { LIMITS, type NominationFormData } from "./nomination-constants";

export function NominationChecklist({ form }: { form: NominationFormData }) {
  const items = [
    { label: "Name", ok: form.name.trim().length > 0 && form.name.length <= LIMITS.name },
    { label: "Description", ok: form.description.trim().length > 0 && form.description.length <= LIMITS.description },
    { label: "Publish date", ok: !!form.publishStartDate },
    { label: "Related apps", ok: form.relatedAppIds.length > 0 },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <span
          key={item.label}
          className={`flex items-center gap-1 text-xs ${item.ok ? "text-muted-foreground" : "text-muted-foreground/60"}`}
        >
          {item.ok ? (
            <CheckCircle size={14} weight="fill" className="text-green-500/70" />
          ) : (
            <Circle size={14} />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function useNominationChecklistReady(form: NominationFormData): boolean {
  return (
    form.name.trim().length > 0 &&
    form.name.length <= LIMITS.name &&
    form.description.trim().length > 0 &&
    form.description.length <= LIMITS.description &&
    !!form.publishStartDate &&
    form.relatedAppIds.length > 0
  );
}
