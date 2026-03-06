#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

STANDALONE_DIR=".next/standalone"
SQLITE_REL="node_modules/better-sqlite3/build/Release/better_sqlite3.node"
SQLITE_OUT="$STANDALONE_DIR/$SQLITE_REL"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "[prepare] Copying standalone assets..."
cp -r public "$STANDALONE_DIR/public"
cp -r .next/static "$STANDALONE_DIR/.next/static"
cp -r drizzle "$STANDALONE_DIR/drizzle"

ELECTRON_VERSION="$(node -e "const v=require('./package.json').devDependencies.electron; process.stdout.write(String(v).replace(/^[^0-9]*/, ''))")"
echo "[prepare] Building better-sqlite3 for Electron $ELECTRON_VERSION (arm64 + x64)..."

npx electron-rebuild -f --build-from-source --only better-sqlite3 --version "$ELECTRON_VERSION" --arch arm64
cp "node_modules/better-sqlite3/build/Release/better_sqlite3.node" "$TMP_DIR/better_sqlite3.arm64.node"

npx electron-rebuild -f --build-from-source --only better-sqlite3 --version "$ELECTRON_VERSION" --arch x64
cp "node_modules/better-sqlite3/build/Release/better_sqlite3.node" "$TMP_DIR/better_sqlite3.x64.node"

echo "[prepare] Creating universal better-sqlite3.node..."
mkdir -p "$(dirname "$SQLITE_OUT")"
lipo -create \
  "$TMP_DIR/better_sqlite3.arm64.node" \
  "$TMP_DIR/better_sqlite3.x64.node" \
  -output "$SQLITE_OUT"

echo "[prepare] Universal sqlite binary:"
file "$SQLITE_OUT"

echo "[prepare] Restoring host-arch better-sqlite3 for local runtime..."
npm rebuild better-sqlite3

echo "[prepare] Done."
