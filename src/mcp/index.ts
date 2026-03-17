import { createServer, type Server } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server";
import { getMcpEnabled, getMcpPort } from "@/lib/mcp-preferences";

let httpServer: Server | null = null;

export async function startMcpServer(port: number): Promise<void> {
  if (httpServer) return;

  httpServer = createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.method === "POST") {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } else if (req.method === "GET") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
    } else if (req.method === "OPTIONS") {
      res.writeHead(204, {
        Allow: "POST, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
    } else {
      res.writeHead(405);
      res.end();
    }
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`[mcp] Server listening on port ${port}`);
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[mcp] Port ${port} is already in use`);
    } else {
      console.error("[mcp] Server error:", err);
    }
    httpServer = null;
  });
}

export function stopMcpServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
    console.log("[mcp] Server stopped");
  }
}

export function isMcpRunning(): boolean {
  return httpServer !== null;
}

export function initMcpServer(): void {
  if (getMcpEnabled()) {
    startMcpServer(getMcpPort());
  }
}
