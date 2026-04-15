"use client";

import { ReferenceLine, Label } from "recharts";
import type { AppMarker } from "@/lib/hooks/use-app-markers";

interface RenderMarkersOptions {
  /** Matches must equal an x-value in the chart data (e.g. "2026-04-15"). */
  markers: AppMarker[];
  /** Data x-values present in the chart. Markers with dates outside are skipped. */
  visibleDates?: string[];
  /** Optional stroke color; individual marker color overrides this. */
  stroke?: string;
}

/**
 * Returns an array of Recharts <ReferenceLine> elements to embed as direct
 * children of a Recharts chart (BarChart, LineChart, AreaChart). Recharts
 * flattens array children via React.Children utilities so this works inline:
 *
 *   <LineChart data={...}>
 *     ...
 *     {renderMarkers({ markers, visibleDates })}
 *   </LineChart>
 */
export function renderMarkers({ markers, visibleDates, stroke }: RenderMarkersOptions) {
  if (!markers || markers.length === 0) return null;

  const visibleSet = visibleDates ? new Set(visibleDates) : null;
  const filtered = visibleSet
    ? markers.filter((m) => visibleSet.has(m.date))
    : markers;

  return filtered.map((m) => (
    <ReferenceLine
      key={m.id}
      x={m.date}
      stroke={m.color ?? stroke ?? "var(--muted-foreground)"}
      strokeDasharray="3 3"
      strokeWidth={1}
      ifOverflow="hidden"
    >
      <Label
        value={m.label}
        position="insideTopRight"
        fontSize={10}
        fill={m.color ?? stroke ?? "var(--muted-foreground)"}
      />
    </ReferenceLine>
  ));
}
