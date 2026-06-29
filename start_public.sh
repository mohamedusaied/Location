#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PORT="${APP_PORT:-5050}"
APP_HOST="${APP_HOST:-0.0.0.0}"
PREFERRED_TUNNEL="${TUNNEL_PROVIDER:-ngrok}"

SSH_KEEPALIVE_INTERVAL="${SSH_KEEPALIVE_INTERVAL:-30}"
SSH_KEEPALIVE_COUNT="${SSH_KEEPALIVE_COUNT:-3}"

echo "Starting local server on ${APP_HOST}:${APP_PORT}..."

if lsof -tiTCP:"${APP_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${APP_PORT} already in use. Reusing existing server process."
else
  (
    cd "${SCRIPT_DIR}"
    nohup python3 app.py > app.log 2>&1 &
    echo $! > .app.pid
  )
  sleep 1
fi

if ! lsof -tiTCP:"${APP_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Server did not start on port ${APP_PORT}. Check ${SCRIPT_DIR}/app.log"
  exit 1
fi

echo "Opening public tunnel..."
echo "Keep this terminal open while sharing the link."

if command -v caffeinate >/dev/null 2>&1; then
  echo "Sleep prevention enabled via caffeinate while this script runs."
  CAFFEINATE_PREFIX=(caffeinate -dimsu)
else
  echo "caffeinate not found; laptop sleep may interrupt the session."
  CAFFEINATE_PREFIX=()
fi

if [[ "${PREFERRED_TUNNEL}" == "ngrok" ]]; then
  if command -v ngrok >/dev/null 2>&1; then
    echo "Using ngrok tunnel on port ${APP_PORT}."
    exec "${CAFFEINATE_PREFIX[@]}" ngrok http "${APP_PORT}"
  fi

  echo "ngrok is not installed or not in PATH. Falling back to localhost.run."
fi

while true; do
  "${CAFFEINATE_PREFIX[@]}" ssh \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval="${SSH_KEEPALIVE_INTERVAL}" \
    -o ServerAliveCountMax="${SSH_KEEPALIVE_COUNT}" \
    -R 80:localhost:${APP_PORT} \
    nokey@localhost.run

  echo "Tunnel disconnected. Reconnecting in 3 seconds..."
  sleep 3
done
