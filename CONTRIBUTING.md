# Contributing to Bascaso

Thanks for your interest in contributing! Bascaso is a self-hosted App Store Connect dashboard with an ASO layer and a tiered AI backend, built with Electron, Next.js 16, TypeScript, Tailwind v4, shadcn/ui, and SQLite.

## Before you start

- **Bugs** – open an issue with steps to reproduce, your macOS version, and whether you run the desktop app or the Docker build.
- **Features** – open an issue to discuss the idea before writing code. This avoids wasted effort if the feature doesn't fit the project's direction.
- **Small fixes** – typos, broken links, obvious one-liners can go straight to a PR.

## Development setup

```bash
git clone https://github.com/kanyacine/bascaso.git
cd bascaso
npm install
npm run electron:dev    # desktop app with hot reload
# or
npm run dev             # web app only, http://localhost:3000
```

You'll need an App Store Connect API key to exercise most features – the setup wizard guides you through it on first launch.

## Project conventions

Read these before writing code – PRs that don't follow them will be asked to change:

- **[docs/UI.md](docs/UI.md)** – typography, icons, component patterns, layout rules
- **[docs/BACKEND.md](docs/BACKEND.md)** – architecture, security model, caching, API conventions
- **[docs/DB.md](docs/DB.md)** – required reading before any schema change
- **[docs/ASO.md](docs/ASO.md)** – scoring methodology, data sources and their limits
- **[docs/MANAGED.md](docs/MANAGED.md)** – the managed tier's billing and error contract

The short version:

- **shadcn/ui for all UI** – no custom primitives.
- **Phosphor icons only** – never lucide-react.
- **Reusable CSS classes over ad-hoc Tailwind** – repeated patterns live in `globals.css` under `@layer components`.
- **Security first** – API keys stay server-side, credentials stay encrypted. No shortcuts.
- **Tests required** – new logic needs tests (`npm run test`). No untested code.
- **No dead code, no workarounds** – fix root causes, remove anything unused.
- **`src/proxy.ts`, not `middleware.ts`** – all request interception lives in the proxy.

## Style

- **English only** – code, comments, commit messages, documentation, issues and pull
  requests. This is a public repo; contributors who do not speak French must be able
  to follow every line of it.
- **Conventional commits** – `feat:`, `fix:`, `ci:`, `build:`, `chore:`, `docs:`,
  `refactor:`, `test:`. Say what changed and why in the body; a message that only
  restates the diff is not worth writing.
- **No `Co-Authored-By` trailers**, and no mention of whatever tool wrote the code.
- Sentence case for titles and headings ("Release management", not "Release Management").
- En dashes (–), not em dashes (—).
- Match the surrounding code's naming and idiom.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Keep the PR focused – one feature or fix per PR.
3. Make sure `npm run test` and `npm run lint` pass.
4. Describe what the change does and why. Screenshots for UI changes are appreciated.
5. Don't bump the version – releases are handled by the maintainer.

## Licensing

Bascaso is licensed under [AGPL-3.0](LICENSE). By submitting a contribution you agree that it will be distributed under the same license.

Bascaso is a fork of [itsyconnect-macos](https://github.com/nickustinov/itsyconnect-macos) by Nick Ustinov.
