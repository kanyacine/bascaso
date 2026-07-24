#!/usr/bin/env bash
# scripts/smoke-afm.sh – manual end-to-end check for the afm-server sidecar.
# CI has no macOS 26 host, so this is run by hand on a dev machine with Apple
# Intelligence enabled.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/native/afm-server"
BIN="$PKG/.build/release/afm-server"

swift build -c release --package-path "$PKG"

echo "== afm-server --check =="
"$BIN" --check
echo

OUT="$(mktemp)"
"$BIN" --serve >"$OUT" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true; rm -f "$OUT"' EXIT

# Wait for the PORT= handshake line (up to ~10s).
PORT=""
for _ in $(seq 1 50); do
  PORT="$(grep -o 'PORT=[0-9]*' "$OUT" | head -1 | cut -d= -f2 || true)"
  [ -n "$PORT" ] && break
  sleep 0.2
done
if [ -z "$PORT" ]; then
  echo "server did not print PORT= handshake" >&2
  cat "$OUT" >&2
  exit 1
fi
echo "== bound port: $PORT =="
echo

echo "== GET /health =="
curl -s "http://127.0.0.1:${PORT}/health"; echo
echo

echo "== GET /v1/models =="
curl -s "http://127.0.0.1:${PORT}/v1/models"; echo
echo

echo "== POST /v1/chat/completions =="
curl -s "http://127.0.0.1:${PORT}/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say hi in one word"}]}'; echo
echo

echo "OK"
