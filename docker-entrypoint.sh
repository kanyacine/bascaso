#!/bin/sh
set -e

# Auto-generate master key on first run if not provided
KEY_FILE="/app/data/master.key"

if [ -z "$ENCRYPTION_MASTER_KEY" ]; then
  if [ -f "$KEY_FILE" ]; then
    export ENCRYPTION_MASTER_KEY=$(cat "$KEY_FILE")
  else
    mkdir -p /app/data
    export ENCRYPTION_MASTER_KEY=$(head -c 32 /dev/urandom | od -A n -t x1 | tr -d ' \n')
    echo "$ENCRYPTION_MASTER_KEY" > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    echo "[itsyconnect] Generated new master key at $KEY_FILE"
  fi
fi

export DATABASE_PATH="${DATABASE_PATH:-/app/data/itsyconnect.db}"

exec node server.js
