# Building and publishing a release

Bascaso ships as a macOS DMG built with Electron Forge and published as a GitHub release.
The whole procedure lives in `scripts/build-release.sh`; this document explains what that
script does, what it needs, and – just as important – which parts of the release chain are
not operational yet.

## Current state

Read this section before trusting a build.

**Signing and notarisation are not wired up.** `forge.config.ts` has the two hooks, but
neither is complete:

```ts
osxSign: process.env.APPLE_TEAM_ID ? {} : undefined,
osxNotarize: process.env.APPLE_ID
  ? { appleId: …, appleIdPassword: process.env.APPLE_ID_PASSWORD!, teamId: process.env.APPLE_TEAM_ID! }
  : undefined,
```

Three distinct problems:

1. **`osxSign` is an empty object.** No identity, no `optionsForFile`. `entitlements.plist`
   sits in the repository root and is referenced by nothing – grep the tree and it appears
   only in itself. The two entitlements it declares (`allow-jit`,
   `allow-unsigned-executable-memory`) are therefore never applied to anything.
2. **The two hooks read different variables.** Signing turns on with `APPLE_TEAM_ID`;
   notarisation turns on with `APPLE_ID`. A partly filled environment silently gets one
   without the other:

   | Environment | Result |
   |---|---|
   | `APPLE_TEAM_ID` only | Signing attempted, notarisation skipped without a word |
   | `APPLE_ID` only | Signing skipped, notarisation attempted on an unsigned app, with `teamId` undefined despite the `!` |
   | Neither | An unsigned, un-notarised DMG that builds cleanly and looks exactly like a release |

3. **Only the script guards against this.** `build-release.sh` refuses to start unless all
   three variables are set, so going through it never hits the mismatch. `npm run
   electron:make:dmg` and a bare `npx electron-forge make` have no such check – that is
   where a silently unsigned DMG comes from.

**Auto-update is a no-op.** `setupAutoUpdater()` is never called: the call site in
`electron/main.ts` is commented out because the feed URL still points at
`update.electronjs.org/nickustinov/itsyconnect-macos/…`, the upstream project this one
forked from. The module-level `autoUpdater` therefore stays `null`, and every entry point
into it – the "Check for updates…" menu item, the `check-for-updates` IPC handler behind
the button in `Settings → General`, and `install-update` – calls `autoUpdater?.…` on
nothing. Nothing throws and nothing happens; the status listener never fires, so the UI
does not report a failure either. `update-electron-app` is listed in `dependencies` but
imported nowhere.

Both are scheduled for a later step of the launch work. Until then, a build produced from
this repository is an unsigned artifact that will not update itself, and no release has
been published yet.

## Prerequisites

| Requirement | Why |
|---|---|
| macOS with the Xcode command line tools | Native module rebuilds and `lipo` |
| Node 24 | See `.nvmrc`; the CI uses the same |
| A Swift toolchain | `prepare-electron.sh` builds the `afm-server` sidecar with `swift build` |
| `gh` CLI, authenticated | The script checks `gh auth status` unless `--no-release` |
| An Apple Developer account | For the signing identity and the notarisation credentials |

The signing identity itself is not configured anywhere in the repository: `osxSign: {}`
leaves the choice of certificate to the signing tool's own discovery. Wiring an explicit
identity and the entitlements file is part of the outstanding work above.

## Environment variables

All three are validated by the script, which exits with `ERROR: <VAR> is not set` if any is
missing.

| Variable | Used by | Purpose |
|---|---|---|
| `APPLE_ID` | `osxNotarize` | Apple ID email; also the gate that enables notarisation |
| `APPLE_ID_PASSWORD` | `osxNotarize` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | `osxSign`, `osxNotarize` | Developer team id; also the gate that enables signing |

## Before you build

1. **Bump the version in both places.** `src/lib/version.ts` exports `APP_VERSION` and
   `BUILD_NUMBER`; `package.json`'s `version` must match `APP_VERSION`. `forge.config.ts`
   reads both for the bundle's `appVersion` and `buildVersion`, and the script reads
   `package.json` to name its artifacts and its tag.
2. **Write the changelog entry.** `CHANGELOG.md` must contain a heading that matches the
   version exactly – `## 1.14.0`, nothing else on the line. The script extracts everything
   between that heading and the next `##` as the release notes, and aborts if the extract
   is empty. It does that check *after* the build, so a missing entry costs you the whole
   build before it tells you.
3. **Check the branding constants** if this is the first release after a rename.
   `src/lib/brand.ts` holds `BRAND_NAME` (the app and DMG name) and `APP_BUNDLE_ID`
   (`app.zavyn.bascaso`). Apple ties signing, notarisation, the Keychain entry and the
   userData directory to the bundle id – changing it after a release strands every existing
   install.

## Running the build

```bash
APPLE_ID=you@example.com \
APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx \
APPLE_TEAM_ID=XXXXXXXXXX \
  ./scripts/build-release.sh [--no-release]
```

`--no-release` builds and stops, without creating the GitHub release.

What the script does, in order:

| Step | Command | Notes |
|---|---|---|
| 1 | `rm -rf out/` | Prevents a stale artifact from a previous version being picked up later |
| 2 | `npm run electron:compile` | `tsc -p electron/tsconfig.json` – the main process has its own tsconfig |
| 3 | `npx next build` | Produces `.next/standalone` |
| 4 | `npm run electron:prepare` | `scripts/prepare-electron.sh`, see below |
| 5 | `npx electron-forge make` | Packages the app and runs both makers |
| 6 | – | Locates the artifacts, renames the DMG, prints its SHA-256 |
| 7 | `gh release create` | Skipped with `--no-release` |

Step 4 is the one with substance. `prepare-electron.sh` builds the Swift `afm-server`
sidecar in release mode, copies `public/`, `.next/static` and `drizzle/` into the
standalone bundle, rebuilds `better-sqlite3` against the pinned Electron version for
`arm64` and then for `x64`, merges the two into a single universal `better_sqlite3.node`
with `lipo`, and finally restores the host-architecture build so local dev keeps working.

Step 5 uses `forge.config.ts`: bundle id `app.zavyn.bascaso`, `asar: false`, the
`afm-server` binary added as an `extraResource`, an `ignore` filter that keeps only
`package.json`, `electron/`, `.next/standalone`, `drizzle/` and `public/`, and two makers –
`MakerDMG` (ULFO format, `public/icon.icns`, overwrite) and `MakerZIP`.

One thing to verify on the output rather than assume: nothing in the repository passes
`--arch`, so a plain `electron-forge make` targets the machine you build on. The universal
wiring is present – `osxUniversal.x64ArchFiles` in the config, the `lipo`'d SQLite binary
in `prepare-electron.sh` – but it only takes effect for a universal build. Run `file` or
`lipo -archs` on the packaged binary before publishing if you intend to ship universal.

### Building without the release step

```bash
npm run electron:make:dmg
```

Compiles, builds Next.js, prepares the bundle and runs the DMG maker only. No clean, no
ZIP, no environment validation and no release. Convenient for a local check – and the exact
path on which the signing gate mismatch described above goes unnoticed.

## What the build produces

Under `out/make/`:

- `Bascaso.dmg` – renamed from the maker's versioned filename to a stable one, so that
  `https://github.com/kanyacine/bascaso/releases/latest/download/Bascaso.dmg` keeps working
  across versions.
- The versioned ZIP, left under its original name.

The script prints the size of both and the SHA-256 of the DMG. If either artifact is
missing it exits rather than publishing half a release; it looks first for files matching
the current version and only then falls back to any `.dmg` / `.zip`, which is why step 1
wipes `out/`.

## Publishing

```
gh release create "v$VERSION" "$DMG_PATH" "$ZIP_PATH" --title "v$VERSION" --notes-file …
```

There is no Electron Forge publisher configured – publication is the `gh` CLI, nothing
else. The release is created on `github.com/kanyacine/bascaso` with the tag `v<version>`
and both artifacts attached.

Note the side effect: `.github/workflows/docker.yml` triggers on `v*` tags and builds and
pushes `ghcr.io/kanyacine/bascaso`. Tagging a release therefore also publishes the
self-hosting image.

## Outstanding work

| Gap | Where |
|---|---|
| `osxSign` carries no identity and no entitlements | `forge.config.ts` |
| `entitlements.plist` is referenced by nothing | repository root |
| Signing and notarisation are gated on different variables | `forge.config.ts` |
| `setupAutoUpdater()` is commented out; the feed URL points at the upstream repository | `electron/main.ts` |
| "Check for updates…" in the menu and in `Settings → General` silently does nothing | `electron/main.ts` |
| `update-electron-app` is a dependency with no import | `package.json` |
| Universal builds are configured but never requested | `forge.config.ts`, `scripts/build-release.sh` |
