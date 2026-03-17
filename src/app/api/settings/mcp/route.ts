import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import {
  getMcpEnabled,
  setMcpEnabled,
  getMcpPort,
  setMcpPort,
} from "@/lib/mcp-preferences";
import { startMcpServer, stopMcpServer, isMcpRunning } from "@/mcp";

export async function GET() {
  return NextResponse.json({
    enabled: getMcpEnabled(),
    port: getMcpPort(),
    running: isMcpRunning(),
  });
}

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  port: z.number().int().min(1024).max(65535).optional(),
});

export async function PUT(request: Request) {
  const parsed = await parseBody(request, updateSchema);
  if (parsed instanceof Response) return parsed;

  if (parsed.port !== undefined) {
    setMcpPort(parsed.port);
  }

  if (parsed.enabled !== undefined) {
    setMcpEnabled(parsed.enabled);

    if (parsed.enabled) {
      stopMcpServer();
      await startMcpServer(parsed.port ?? getMcpPort());
    } else {
      stopMcpServer();
    }
  } else if (parsed.port !== undefined && isMcpRunning()) {
    // Port changed while running – restart
    stopMcpServer();
    await startMcpServer(parsed.port);
  }

  return NextResponse.json({
    enabled: getMcpEnabled(),
    port: getMcpPort(),
    running: isMcpRunning(),
  });
}
