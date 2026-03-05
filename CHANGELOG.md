# Changelog

## 1.1.0

- Add Mac App Store build support with StoreKit in-app purchase for Pro upgrade
- Add `MAS=1` build flag to distinguish MAS from direct distribution builds
- Add StoreKit purchase and restore flow in Electron main process
- Add dedicated license UI for MAS builds (buy/restore buttons with localised pricing)
- Guard LemonSqueezy activation routes when running as MAS build
- Add `electron:make:mas` build script
- Disable auto-updater for MAS builds (updates via App Store)
- Add file-based logging – all console output now writes to `~/Library/Logs/Itsyconnect/itsyconnect.log` with automatic 1 MB rotation
- Add Help menu with "Copy diagnostics to clipboard" (version, system info, recent logs as markdown) and "Show log files" (opens Finder)
- Enrich analytics logging with all report types in phase 1 and total data points after backfill
- Add local AI server support (LM Studio / OpenAI-compatible) with model discovery and auto-load

## 1.0.0

- Initial release
