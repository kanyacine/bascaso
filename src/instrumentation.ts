export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Trigger env validation and auto-generation of ENCRYPTION_MASTER_KEY
    await import("./lib/env");

    // Start background sync worker (guards on hasCredentials() internally)
    const { startSyncWorker } = await import("./lib/sync/worker");
    startSyncWorker();

    // Start MCP server if enabled in preferences
    const { initMcpServer } = await import("./mcp");
    initMcpServer();
  }
}
