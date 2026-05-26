/** Distribution platform flags. */

/**
 * True when running a Mac App Store build. MAS builds are sandboxed: updates go
 * through the App Store (no in-app auto-updater) and the local MCP server is
 * unavailable. Set via `NEXT_PUBLIC_MAS=1` at build time.
 */
export const IS_MAS = process.env.NEXT_PUBLIC_MAS === "1";
