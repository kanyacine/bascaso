import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { APP_VERSION } from "@/lib/version";
import { MCP_SERVER_NAME } from "@/lib/brand";
import { registerGetApp } from "./tools/get-app";
import { registerUpdateApp } from "./tools/update-app";
import { registerTranslate } from "./tools/translate";
import { registerManageLocales } from "./tools/manage-locales";
import { registerGetInsights } from "./tools/get-insights";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: APP_VERSION,
  });

  registerGetApp(server);
  registerUpdateApp(server);
  registerTranslate(server);
  registerManageLocales(server);
  registerGetInsights(server);

  return server;
}
