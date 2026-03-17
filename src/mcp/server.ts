import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { APP_VERSION } from "@/lib/version";
import { registerUpdateWhatsNew } from "./tools/update-whats-new";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "itsyconnect",
    version: APP_VERSION,
  });

  registerUpdateWhatsNew(server);

  return server;
}
