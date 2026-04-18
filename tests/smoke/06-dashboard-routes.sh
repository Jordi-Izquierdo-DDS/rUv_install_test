#!/bin/bash
# Smoke 06 — viz dashboard + v5 API surface smoke.
#
# Purpose: validate that both dashboards (v5 at /, legacy v4 at /legacy) are
# served and that the full v5 API surface returns 200 for every canonical
# endpoint. Boots its own viz instance on PORT=3213 with DATA_ROOT pinned to
# the repo root, so it runs safely alongside any dev viz on 3100/3199.
#
# Exit codes:
#   0 — all checks PASS
#   1 — one or more checks FAIL
#   2 — viz server refused to start within 5s

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PORT=3213
BASE="http://localhost:${PORT}"
SERVER_LOG="/tmp/smoke06-viz.log"
OWN_PID=""
STARTED_HERE="no"

# ─── Cleanup: only kill the PID we spawned (not an already-running instance) ──
cleanup() {
  if [ "$STARTED_HERE" = "yes" ] && [ -n "$OWN_PID" ]; then
    if kill -0 "$OWN_PID" 2>/dev/null; then
      kill "$OWN_PID" 2>/dev/null || true
      # Give it 1s to stop gracefully, then SIGKILL
      for _ in 1 2 3 4 5; do
        kill -0 "$OWN_PID" 2>/dev/null || break
        sleep 0.2
      done
      kill -9 "$OWN_PID" 2>/dev/null || true
    fi
  fi
  rm -f "$SERVER_LOG" 2>/dev/null || true
}
trap cleanup EXIT

echo "[smoke-06] dashboard + v5 API surface smoke"
echo "[smoke-06] root=$ROOT port=$PORT"

# ─── Step 1: start viz if port is free ────────────────────────────────────────
port_busy() {
  # Use bash /dev/tcp — no external deps. Returns 0 if port accepts.
  (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null && { exec 3>&-; return 0; } || return 1
}

if port_busy; then
  echo "[smoke-06] port $PORT already serving — using existing instance"
else
  echo "[smoke-06] starting viz on $PORT (log: $SERVER_LOG)"
  PORT="$PORT" DATA_ROOT="$ROOT" node viz/src/server.js >"$SERVER_LOG" 2>&1 &
  OWN_PID=$!
  STARTED_HERE="yes"

  # Wait up to 5s for / to respond
  READY="no"
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.5
    if ! kill -0 "$OWN_PID" 2>/dev/null; then
      echo "FAIL: viz PID $OWN_PID exited during boot; server log:"
      sed 's/^/  | /' "$SERVER_LOG" 2>/dev/null || true
      exit 2
    fi
    CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$BASE/" 2>/dev/null || echo 000)"
    if [ "$CODE" = "200" ]; then READY="yes"; break; fi
  done
  if [ "$READY" != "yes" ]; then
    echo "FAIL: viz did not become ready within 5s"
    sed 's/^/  | /' "$SERVER_LOG" 2>/dev/null || true
    exit 2
  fi
  echo "[smoke-06] viz ready (PID=$OWN_PID) after ${i}x500ms"
fi

# ─── Step 2: check helpers ────────────────────────────────────────────────────
RESULTS=()

record() {
  # record "<status>" "<name>" "<detail>"
  RESULTS+=("$1|$2|$3")
}

# Check a URL returns 200. Optional substring assertion on body.
check_get() {
  local name="$1" path="$2" must_contain="${3:-}"
  local tmp code
  tmp="$(mktemp)"
  code="$(curl -sS --max-time 5 -o "$tmp" -w '%{http_code}' "$BASE$path" 2>/dev/null || echo 000)"
  if [ "$code" != "200" ]; then
    record "FAIL" "$name" "GET $path → HTTP $code"
    rm -f "$tmp"
    return 1
  fi
  if [ -n "$must_contain" ]; then
    if ! grep -qF -- "$must_contain" "$tmp"; then
      record "FAIL" "$name" "body missing: $must_contain"
      rm -f "$tmp"
      return 1
    fi
  fi
  record "PASS" "$name" "200"
  rm -f "$tmp"
  return 0
}

check_post() {
  local name="$1" path="$2" body="$3"
  local code
  code="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' \
    --data "$body" "$BASE$path" 2>/dev/null || echo 000)"
  if [ "$code" != "200" ]; then
    record "FAIL" "$name" "POST $path → HTTP $code"
    return 1
  fi
  record "PASS" "$name" "200"
  return 0
}

# ─── Step 3: dashboards ───────────────────────────────────────────────────────
check_get "dashboard v5 /"          "/"        "ruflo v5 — Learning Cycle Live"     || true
check_get "dashboard legacy /legacy" "/legacy"  "Three-Tier Learning Visualization"  || true

# ─── Step 4: v5 API surface (GET 200) ─────────────────────────────────────────
for ep in \
  "/api/v5/cycle" \
  "/api/v5/services" \
  "/api/v5/degradation" \
  "/api/v5/trajectories" \
  "/api/v5/intel" \
  "/api/v5/events" \
  "/api/sona" \
  "/api/reasoningbank" \
  "/api/patterns"; do
  check_get "v5 GET $ep" "$ep" "" || true
done

# ─── Step 5: graph + pipeline ────────────────────────────────────────────────
for ep in \
  "/api/graph" \
  "/api/graph/pulse" \
  "/api/graph/config" \
  "/api/graph/summary" \
  "/api/pipeline-overview"; do
  check_get "graph GET $ep" "$ep" "" || true
done

# ─── Step 6: controllers + daemon + session ──────────────────────────────────
for ep in \
  "/api/controllers" \
  "/api/controllers/status" \
  "/api/controllers/classification" \
  "/api/daemon-health" \
  "/api/current-session"; do
  check_get "ctl GET $ep" "$ep" "" || true
done

# ─── Step 7: config ───────────────────────────────────────────────────────────
check_get "config GET /api/layout" "/api/layout" "" || true
check_get "config GET /api/theme"  "/api/theme"  "" || true

# ─── Step 8: /api/graph → first-node drill-down via /api/node/<id> ────────────
GRAPH_JSON="$(curl -sS --max-time 5 "$BASE/api/graph" 2>/dev/null || echo '{}')"
FIRST_NODE_ID="$(printf '%s' "$GRAPH_JSON" | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    try {
      const g = JSON.parse(s);
      const n = Array.isArray(g.nodes) && g.nodes[0] ? g.nodes[0].id : "";
      process.stdout.write(String(n || ""));
    } catch { process.stdout.write(""); }
  });
' 2>/dev/null || echo "")"

if [ -z "$FIRST_NODE_ID" ]; then
  record "FAIL" "node drill-down" "could not extract nodes[0].id from /api/graph"
else
  # URL-encode minimal: replace spaces + a few chars; node IDs are usually safe slugs
  SAFE_ID="$(printf '%s' "$FIRST_NODE_ID" | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      process.stdout.write(encodeURIComponent(s));
    });
  ')"
  check_get "node GET /api/node/$FIRST_NODE_ID" "/api/node/$SAFE_ID" "" || true
fi

# ─── Step 9: worker + learning triggers (POST) ────────────────────────────────
check_post "worker POST /api/daemon/trigger (preload)" \
  "/api/daemon/trigger" '{"worker":"preload"}' || true

check_post "learning POST /api/learning/trigger (pretrain)" \
  "/api/learning/trigger" '{"action":"pretrain"}' || true

# ─── Step 10: print summary table ─────────────────────────────────────────────
echo ""
echo "[smoke-06] ─── RESULTS ─────────────────────────────────────────────────"
printf "  %-6s  %-52s  %s\n" "status" "check" "detail"
printf "  %-6s  %-52s  %s\n" "------" "----------------------------------------------------" "------"

PASS_COUNT=0
FAIL_COUNT=0
for row in "${RESULTS[@]}"; do
  IFS='|' read -r status name detail <<<"$row"
  printf "  [%-4s]  %-52s  %s\n" "$status" "$name" "$detail"
  if [ "$status" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo "  $PASS_COUNT/$TOTAL checks passed"

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "  OVERALL: PASS"
  exit 0
else
  echo "  OVERALL: FAIL ($FAIL_COUNT failing)"
  exit 1
fi
