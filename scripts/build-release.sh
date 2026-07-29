#!/bin/bash
set -e

# Build a signed, notarized release (DMG + ZIP) and create a GitHub release.
#
# Required environment variables:
#   APPLE_ID            – Apple ID email
#   APPLE_ID_PASSWORD   – app-specific password
#   APPLE_TEAM_ID       – Apple Developer team ID
#
# Prerequisites:
#   - gh CLI authenticated (gh auth login)
#   - Xcode command line tools installed
#
# Options:
#   --no-release   Skip creating a draft GitHub release (notarize only)
#
# Usage:
#   APPLE_ID=you@example.com APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=XXXXXXXXXX \
#     ./scripts/build-release.sh [--no-release]

SKIP_RELEASE=false
for arg in "$@"; do
  case "$arg" in
    --no-release) SKIP_RELEASE=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Validate credentials. Two accepted strategies, exactly one must be complete –
# same rule as forge.config.ts, which reads the same environment.
#
# APPLE_KEYCHAIN_PROFILE is preferred: the password strategy makes notarytool
# run with `--password <secret>` in its arguments, readable by any process on
# this machine via `ps` for as long as the submission lasts. Store it once with:
#   xcrun notarytool store-credentials <name> --apple-id … --team-id … --password …
if [ -n "$APPLE_KEYCHAIN_PROFILE" ]; then
  NOTARY_ARGS=(--keychain-profile "$APPLE_KEYCHAIN_PROFILE")
else
  for var in APPLE_ID APPLE_ID_PASSWORD APPLE_TEAM_ID; do
    if [ -z "${!var}" ]; then
      echo "ERROR: $var is not set (or set APPLE_KEYCHAIN_PROFILE instead – preferred)"
      exit 1
    fi
  done
  NOTARY_ARGS=(--apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID")
  echo "WARNING: notarising with APPLE_ID_PASSWORD – it will be visible in \`ps\` output."
  echo "         Prefer APPLE_KEYCHAIN_PROFILE (xcrun notarytool store-credentials)."
fi

# Check gh is authenticated (only needed for release)
if [ "$SKIP_RELEASE" = false ] && ! gh auth status &>/dev/null; then
  echo "ERROR: gh CLI is not authenticated. Run: gh auth login"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
echo "==> Building Bascaso v$VERSION"
echo ""

step_start() { STEP_START=$SECONDS; echo "==> $1..."; }
step_done() { echo "    done in $(( SECONDS - STEP_START ))s"; echo ""; }

step_start "Cleaning previous build artifacts"
rm -rf out/
step_done

step_start "Compiling Electron TypeScript"
npm run electron:compile
step_done

step_start "Building Next.js"
npx next build
step_done

step_start "Preparing standalone bundle"
npm run electron:prepare
step_done

step_start "Making DMG + ZIP (signing + notarizing)"
npx electron-forge make
step_done

# Find outputs and rename DMG to stable filename for /releases/latest/download/Bascaso.dmg
# Prefer artifacts matching the current version to avoid picking stale files from previous builds.
ORIG_DMG=$(find out/make -name "*${VERSION}*.dmg" -type f | head -1)
ZIP_PATH=$(find out/make -name "*-${VERSION}.zip" -type f | head -1)

# Fallbacks for unusual maker naming patterns
if [ -z "$ORIG_DMG" ]; then
  ORIG_DMG=$(find out/make -name "*.dmg" -type f | head -1)
fi
if [ -z "$ZIP_PATH" ]; then
  ZIP_PATH=$(find out/make -name "*.zip" -type f | head -1)
fi

if [ -z "$ORIG_DMG" ]; then
  echo "ERROR: DMG not found in out/make/"
  exit 1
fi
if [ -z "$ZIP_PATH" ]; then
  echo "ERROR: ZIP not found in out/make/"
  exit 1
fi

DMG_PATH="$(dirname "$ORIG_DMG")/Bascaso.dmg"
mv "$ORIG_DMG" "$DMG_PATH"

# Forge notarises and staples the .app, then builds the DMG from it – so the
# container itself carries no signature and no ticket. Measured on a real build:
# `spctl -a -t open` rejects it with "no usable signature", and `stapler
# validate` reports no ticket. The app inside is fine once installed; it is
# opening the DMG that Gatekeeper objects to.
#
# Sign it with the same identity the app was signed with, rather than a name
# hardcoded here: if they ever diverge, that is a bug worth failing on.
step_start "Signing and notarizing the DMG"
APP_PATH=$(find out -maxdepth 2 -name "*.app" -type d | head -1)
if [ -z "$APP_PATH" ]; then
  echo "ERROR: packaged .app not found – cannot determine the signing identity"
  exit 1
fi
IDENTITY=$(codesign -dv --verbose=4 "$APP_PATH" 2>&1 | sed -n 's/^Authority=\(Developer ID Application: .*\)$/\1/p' | head -1)
if [ -z "$IDENTITY" ]; then
  echo "ERROR: could not read a Developer ID identity from $APP_PATH"
  exit 1
fi
codesign --sign "$IDENTITY" --timestamp "$DMG_PATH"
xcrun notarytool submit "$DMG_PATH" "${NOTARY_ARGS[@]}" --wait
xcrun stapler staple "$DMG_PATH"
step_done

# Verify rather than assume: a notarisation that reported success and a ticket
# that actually travels with the file are not the same claim.
xcrun stapler validate "$DMG_PATH"
spctl -a -vvv -t open --context context:primary-signature "$DMG_PATH"

DMG_SHA=$(shasum -a 256 "$DMG_PATH" | cut -d' ' -f1)

echo "==> Build complete!"
echo "    DMG: $DMG_PATH ($(du -h "$DMG_PATH" | cut -f1 | xargs))"
echo "    ZIP: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1 | xargs))"
echo "    SHA256 (DMG): $DMG_SHA"
echo ""

if [ "$SKIP_RELEASE" = false ]; then
  NOTES_FILE=$(mktemp)
  sed -n "/^## $VERSION$/,/^## /{ /^## /!p; }" CHANGELOG.md > "$NOTES_FILE"

  if [ ! -s "$NOTES_FILE" ]; then
    echo "ERROR: No changelog entry found for version $VERSION in CHANGELOG.md"
    rm -f "$NOTES_FILE"
    exit 1
  fi

  step_start "Creating GitHub release v$VERSION"
  gh release create "v$VERSION" "$DMG_PATH" "$ZIP_PATH" \
    --title "v$VERSION" \
    --notes-file "$NOTES_FILE"
  rm -f "$NOTES_FILE"
  step_done
fi

TOTAL=$(( SECONDS ))
echo "==> All done in $(( TOTAL / 60 ))m $(( TOTAL % 60 ))s"
if [ "$SKIP_RELEASE" = false ]; then
  echo "    https://github.com/kanyacine/bascaso/releases"
else
  echo "    GitHub release skipped (--no-release)."
fi
