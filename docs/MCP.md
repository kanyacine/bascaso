# MCP server

Itsyconnect includes an optional [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that lets AI coding assistants interact with your App Store Connect data directly.

## Setup

1. Open **Settings > General**
2. Enable the **MCP server** toggle
3. Set the port (default: 3100)
4. Expand your AI tool's section and copy the config snippet

### Claude Code

```bash
claude mcp add --transport http itsyconnect http://127.0.0.1:3100/mcp
```

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp.itsyconnect]
type = "remote"
url = "http://127.0.0.1:3100/mcp"
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "itsyconnect": {
      "url": "http://127.0.0.1:3100/mcp"
    }
  }
}
```

### OpenCode

Add to `opencode.json` under `mcp`:

```json
{
  "itsyconnect": {
    "type": "remote",
    "url": "http://127.0.0.1:3100/mcp"
  }
}
```

## Docker

When running Itsyconnect in Docker, expose the MCP port alongside the web UI port:

```bash
docker run -d -p 3000:3000 -p 3100:3100 -v itsyconnect-data:/app/data ghcr.io/nickustinov/itsyconnect:latest
```

Enable the MCP server in **Settings > General** after starting the container.

## Available tools

### update_whats_new

Update the "What's new" release notes for an app version across one or more locales.

**Parameters:**
- `appId` – the App Store Connect app ID (numeric string)
- `versionId` – the app store version ID to update
- `whatsNew` – map of locale code (e.g. `en-US`, `de-DE`) to release notes text (max 4000 chars each)

Only locales that already exist on the version will be updated. The version must be in an editable state (Prepare for submission, Rejected, etc.).

**Example prompt:**

> Update the what's new for my app's latest version with these release notes in English and German

## Architecture

- Runs as a separate HTTP server on its own port (default 3100)
- Uses MCP Streamable HTTP transport (stateless)
- Shares the database and ASC client with the main app – no separate process or connection
- Configurable via Settings UI or the `/api/settings/mcp` API endpoint
