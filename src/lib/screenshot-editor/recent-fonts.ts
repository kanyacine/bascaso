// Fonts the user picked last, newest first. localStorage, not the database: it is per-machine UI
// state, and the app:// origin keeps it across restarts.
const KEY = "bascaso.recentFonts";
const MAX = 12;

/** Pure: name to the front, no repeats, oldest dropped past MAX. */
export function mergeRecent(list: string[], name: string, max = MAX): string[] {
  return [name, ...list.filter((f) => f !== name)].slice(0, max);
}

export function readRecentFonts(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string").slice(0, MAX) : [];
  } catch {
    return []; // hand-edited or corrupt – start over rather than break the picker
  }
}

/** Records a pick and returns the new list. */
export function pushRecentFont(name: string): string[] {
  const next = mergeRecent(readRecentFonts(), name);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or disabled – the list just will not persist
  }
  return next;
}
