# MCP server

Bascaso includes an optional [MCP](https://modelcontextprotocol.io) server that lets AI coding assistants interact with your App Store Connect data.

## Setup

1. Open **Settings > General**, enable **MCP server** (default port: 3100)
2. Copy the config snippet for your AI tool:

<details><summary>Claude Code</summary>

```bash
claude mcp add --transport http bascaso http://127.0.0.1:3100/mcp
```
</details>

<details><summary>Codex</summary>

Add to `~/.codex/config.toml`:
```toml
[mcp.bascaso]
type = "remote"
url = "http://127.0.0.1:3100/mcp"
```
</details>

<details><summary>Cursor</summary>

Add to `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "bascaso": {
      "url": "http://127.0.0.1:3100/mcp"
    }
  }
}
```
</details>

<details><summary>OpenCode</summary>

Add to `opencode.json` under `mcp`:
```json
{
  "bascaso": {
    "type": "remote",
    "url": "http://127.0.0.1:3100/mcp"
  }
}
```
</details>

**Docker:** expose the MCP port with `-p 3100:3100`, then enable in Settings.

## Tools

All tools accept **app names** (e.g. "Bascaso"), not numeric IDs. Version strings (e.g. "1.7.0") are optional – omit to use the editable version.

| Tool | Description |
|------|-------------|
| `get_app` | Read app data – versions, locales, all field values |
| `update_app` | Write any field for a locale |
| `translate` | AI-translate field(s) from source to target locale(s) |
| `manage_locales` | Add or remove locales |

<details><summary>Tool details</summary>

### get_app
- `app` – app name. Omit to list all apps.
- `version` – version string. Omit for editable version.
- `locale` – locale code. Omit for overview; provide for full field dump.

### update_app
- `app` – app name
- `version` – version string (optional)
- `field` – field name (see below)
- `locale` – locale code (required for listing/details fields, not for review fields)
- `value` – new value

**Listing fields:** whatsNew, description, keywords, promotionalText, supportUrl, marketingUrl
**Details fields:** name, subtitle, privacyPolicyUrl, privacyChoicesUrl
**Review fields:** notes, contactEmail, contactFirstName, contactLastName, contactPhone, demoAccountName, demoAccountPassword, demoAccountRequired

### translate
- `app` – app name
- `version` – version string (optional)
- `fields` – comma-separated (e.g. "whatsNew,description,name,subtitle")
- `sourceLocale` – source locale (e.g. "en-US")
- `targetLocales` – comma-separated targets. Omit to translate to all.

### manage_locales
- `app` – app name
- `version` – version string (optional)
- `action` – "add" or "remove"
- `locale` – locale code to add/remove
- `confirm` – must be "true" for remove (destructive)

</details>

**Example prompts:**
- *Show me Bascaso's current store listing in English*
- *Update the what's new and translate to all languages*
- *Add German and French locales and translate everything*
- *Write a promotional text based on the what's new*

## Architecture

- 4 tools covering the entire release workflow
- Accepts human-readable names, resolves IDs internally
- Separate HTTP server on port 3100, Streamable HTTP transport (stateless)
- Shares database and ASC client with the main app
- Mutations push SSE events to auto-refresh the UI
