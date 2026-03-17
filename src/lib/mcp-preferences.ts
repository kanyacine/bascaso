import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

const MCP_ENABLED_KEY = "mcp_enabled";
const MCP_PORT_KEY = "mcp_port";
const DEFAULT_PORT = 3100;

function getPref(key: string): string | null {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, key))
      .get();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function setPref(key: string, value: string): void {
  db.insert(appPreferences)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appPreferences.key,
      set: { value },
    })
    .run();
}

export function getMcpEnabled(): boolean {
  return getPref(MCP_ENABLED_KEY) === "true";
}

export function setMcpEnabled(enabled: boolean): void {
  setPref(MCP_ENABLED_KEY, String(enabled));
}

export function getMcpPort(): number {
  const val = getPref(MCP_PORT_KEY);
  if (!val) return DEFAULT_PORT;
  const n = Number(val);
  return n >= 1024 && n <= 65535 ? n : DEFAULT_PORT;
}

export function setMcpPort(port: number): void {
  setPref(MCP_PORT_KEY, String(port));
}
