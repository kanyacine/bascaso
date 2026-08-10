"use client";

import { Slider } from "@/components/ui/slider";

export function PanelSlider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

// Native colour input: shadcn has no colour picker, and the platform control is the right one.
export function PanelColor({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
             className="size-7 cursor-pointer rounded border bg-transparent" />
    </label>
  );
}
