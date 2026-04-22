#!/usr/bin/env bash
# Start the widget webhook server + ngrok tunnel, print the public URL,
# and keep both running until Ctrl-C.
#
# Usage:
#   ./scripts/start-demo.sh                     # port 6767, auto-detect ngrok URL
#   PORT=7000 ./scripts/start-demo.sh           # custom port
#   CALLBACK_DELAY_MS=500 ./scripts/start-demo.sh
#
# After this prints the public URL, in another terminal run:
#   node scripts/create-scheduler.mjs \
#     --copy-audience-from <jobId> \
#     scripts/configs/demo-sales-dashboard.json
# (make sure to paste the ngrok URL into the config first)

set -euo pipefail

PORT="${PORT:-6767}"
NGROK_API_PORT="${NGROK_API_PORT:-4040}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEBHOOK_DIR="$REPO_ROOT/src/widget-webhook-server"

# ── Check deps ────────────────────────────────────────────────────────────────
command -v ngrok >/dev/null 2>&1 || { echo "❌ ngrok not installed. brew install ngrok (and set authtoken)"; exit 1; }
command -v node  >/dev/null 2>&1 || { echo "❌ node not installed"; exit 1; }

if [ ! -d "$WEBHOOK_DIR/node_modules" ]; then
  echo "▶ installing webhook server deps…"
  (cd "$WEBHOOK_DIR" && npm install --silent)
fi

# ── Free port if already in use ───────────────────────────────────────────────
if lsof -ti ":$PORT" >/dev/null 2>&1; then
  echo "▶ killing existing process on port $PORT"
  lsof -ti ":$PORT" | xargs kill 2>/dev/null || true
  sleep 1
fi
if lsof -ti ":$NGROK_API_PORT" >/dev/null 2>&1; then
  echo "▶ killing existing ngrok (port $NGROK_API_PORT)"
  lsof -ti ":$NGROK_API_PORT" | xargs kill 2>/dev/null || true
  sleep 1
fi

# ── Start webhook server ──────────────────────────────────────────────────────
echo "▶ starting widget webhook server on :$PORT"
PORT="$PORT" CALLBACK_DELAY_MS="${CALLBACK_DELAY_MS:-2000}" \
  node "$WEBHOOK_DIR/server.mjs" > "/tmp/widget-webhook.log" 2>&1 &
SERVER_PID=$!

# Wait for server health
for _ in $(seq 1 20); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "  ✓ webhook server ready (pid $SERVER_PID)"
    break
  fi
  sleep 0.25
done

# ── Start ngrok ───────────────────────────────────────────────────────────────
echo "▶ starting ngrok tunnel"
ngrok http "$PORT" --log stdout > "/tmp/ngrok.log" 2>&1 &
NGROK_PID=$!

# Poll ngrok API for public URL (max 15s)
PUBLIC_URL=""
for _ in $(seq 1 60); do
  PUBLIC_URL=$(curl -s "http://localhost:$NGROK_API_PORT/api/tunnels" 2>/dev/null \
    | python3 -c "import json,sys
try:
  d=json.load(sys.stdin)
  for t in d.get('tunnels',[]):
    if t.get('proto')=='https':
      print(t['public_url']);break
except: pass" 2>/dev/null)
  [ -n "$PUBLIC_URL" ] && break
  sleep 0.5
done

if [ -z "$PUBLIC_URL" ]; then
  echo "❌ ngrok failed to start (see /tmp/ngrok.log)"
  kill "$SERVER_PID" "$NGROK_PID" 2>/dev/null || true
  exit 1
fi

echo "  ✓ ngrok tunnel: $PUBLIC_URL"

# ── Save URL for other scripts to pick up ─────────────────────────────────────
echo "$PUBLIC_URL" > "$REPO_ROOT/.ngrok-url"
echo "  ✓ wrote public URL to .ngrok-url"

# ── Print summary ─────────────────────────────────────────────────────────────
cat <<SUMMARY

─────────────────────────────────────────────────────────────
  🎯 Demo infrastructure is live

  Public URL:  $PUBLIC_URL
  Health:      $PUBLIC_URL/health
  Presets:     $PUBLIC_URL/presets
  Preview:     $PUBLIC_URL/<preset-name>/preview

  Example webhook (what EkoAI will POST):
    curl -X POST $PUBLIC_URL/sales-dashboard/webhook \\
      -H 'Content-Type: application/json' \\
      -H 'x-api-key: widget-webhook-secret' \\
      -d '{"id":"<scheduleJobRunUserId>"}'

  Logs:  tail -f /tmp/widget-webhook.log  (webhook server)
         tail -f /tmp/ngrok.log           (ngrok)

  Next: create a scheduled job that uses this URL:
    node scripts/create-scheduler.mjs \\
      --public-url "$PUBLIC_URL" \\
      --copy-audience-from <existingJobId> \\
      scripts/configs/demo-sales-dashboard.json

  Press Ctrl-C to stop everything.
─────────────────────────────────────────────────────────────

SUMMARY

# ── Cleanup on Ctrl-C ─────────────────────────────────────────────────────────
trap 'echo; echo "▶ shutting down…"; kill $SERVER_PID $NGROK_PID 2>/dev/null || true; rm -f "$REPO_ROOT/.ngrok-url"; exit 0' INT TERM

# Wait forever (or until one of the processes dies)
wait
