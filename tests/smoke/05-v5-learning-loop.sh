#!/bin/bash
# Smoke 05 — v5 self-learning loop produces measurable state delta.
#
# Purpose: validate that triggering a session-end / force-learn cycle on the
# live daemon moves the persisted state (sona state.json, ewc_task_count,
# stateBytes, or a new metrics export). Leniency by design: "no delta" is
# UNCHANGED (exit 0), not FAIL — a read-only snapshot can legitimately have
# nothing to learn. Only a dead daemon or failed IPC is a hard FAIL.
#
# Trigger strategy (in order of preference — falls back if one fails):
#   1. IPC `session_end` command on the live daemon socket (canonical Loop C).
#      This is what SessionEnd hook dispatches; it runs services[].onSessionEnd()
#      → forceLearn → saveState → consolidateTasks → prunePatterns → metrics export.
#   2. IPC `force_learn` command (Loop B crystallisation only).
#   3. SIGUSR1 to daemon PID (not currently wired; listed for future-proofing).
#
# Wired path for this script: IPC `session_end` (commands defined in
# .claude/helpers/ruvector-daemon.mjs L655 and L644).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SOCK="$ROOT/.claude-flow/ruvector-daemon.sock"
PID_FILE="$ROOT/.claude-flow/ruvector-daemon.pid"
STATE="$ROOT/.claude-flow/sona/state.json"
RBANK="$ROOT/.claude-flow/reasoning-bank/patterns.json"
METRICS_LATEST="$ROOT/.claude-flow/metrics/session-latest.json"
METRICS_DIR="$ROOT/.claude-flow/metrics"
CURSESS="$ROOT/.claude-flow/data/current-session.json"
MEMDB="$ROOT/.swarm/memory.db"

BEFORE="/tmp/sona-before.json"
AFTER="/tmp/sona-after.json"
LATEST_BEFORE="/tmp/metrics-latest-before.json"
LATEST_AFTER="/tmp/metrics-latest-after.json"
cleanup() { rm -f "$BEFORE" "$AFTER" "$LATEST_BEFORE" "$LATEST_AFTER" /tmp/sona-smoke05-resp.json 2>/dev/null || true; }
trap cleanup EXIT

echo "[smoke-05] v5 learning-loop delta test"
echo "[smoke-05] root=$ROOT"

# ─── Step 1: Pre-check daemon ─────────────────────────────────────────────────
if [ ! -f "$PID_FILE" ]; then
  echo "FAIL: no PID file at $PID_FILE. Start the daemon:"
  echo "       node $ROOT/.claude/helpers/ruvector-daemon.mjs &"
  exit 1
fi
DAEMON_PID="$(cat "$PID_FILE")"
if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
  echo "FAIL: PID $DAEMON_PID from $PID_FILE is not running."
  echo "       Restart with: node $ROOT/.claude/helpers/ruvector-daemon.mjs &"
  exit 1
fi
if [ ! -S "$SOCK" ]; then
  echo "FAIL: socket $SOCK not present (daemon alive but not listening?)"
  exit 1
fi
echo "[smoke-05] daemon alive: PID=$DAEMON_PID sock=$SOCK"

# ─── IPC helper (JSON-line over unix socket) ──────────────────────────────────
# Usage: ipc '{"command":"status"}' > /tmp/resp.json
ipc() {
  SOCK_PATH="$SOCK" CMD="$1" node -e '
    const net = require("net"); const s = net.createConnection(process.env.SOCK_PATH);
    let buf = ""; let done = false;
    s.setTimeout(15000, () => { if (!done) { console.error("IPC timeout"); process.exit(2); } });
    s.on("data", d => {
      buf += d.toString();
      const i = buf.indexOf("\n");
      if (i !== -1 && !done) { done = true; process.stdout.write(buf.slice(0, i)); s.end(); }
    });
    s.on("error", e => { console.error("IPC error: " + e.message); process.exit(2); });
    s.on("connect", () => s.write(process.env.CMD + "\n"));
  '
}

# ─── Step 2: Snapshot "before" ────────────────────────────────────────────────
cp "$STATE" "$BEFORE" 2>/dev/null || echo "{}" > "$BEFORE"
cp "$METRICS_LATEST" "$LATEST_BEFORE" 2>/dev/null || echo "{}" > "$LATEST_BEFORE"

snapshot() {
  local state_file="$1" latest_file="$2"
  STATE_FILE="$state_file" LATEST_FILE="$latest_file" \
  RBANK_FILE="$RBANK" CURSESS_FILE="$CURSESS" METRICS_DIR="$METRICS_DIR" \
  MEMDB="$MEMDB" STATE_MTIME_FILE="$state_file" \
  node -e '
    const fs = require("fs"); const path = require("path");
    const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return dflt; } };
    const state   = readJson(process.env.STATE_FILE, {});
    const latest  = readJson(process.env.LATEST_FILE, {});
    const rbank   = readJson(process.env.RBANK_FILE, []);
    const cursess = readJson(process.env.CURSESS_FILE, {});
    let stateBytes = 0; try { stateBytes = fs.statSync(process.env.STATE_FILE).size; } catch {}
    let stateMtime = 0; try { stateMtime = fs.statSync(process.env.STATE_FILE).mtimeMs|0; } catch {}
    let historyCount = 0;
    try { historyCount = fs.readdirSync(process.env.METRICS_DIR).filter(f => /^session-\d+\.json$/.test(f)).length; } catch {}
    // memory.db COUNT(*) via better-sqlite3 (best effort; skip if unavailable)
    let memEntries = -1;
    try {
      const Database = require(path.join(process.cwd(), "node_modules", "better-sqlite3"));
      const db = new Database(process.env.MEMDB, { readonly: true, fileMustExist: true });
      try { memEntries = db.prepare("SELECT COUNT(*) c FROM memory_entries").get().c|0; }
      catch { try { memEntries = db.prepare("SELECT COUNT(*) c FROM memory").get().c|0; } catch {} }
      db.close();
    } catch {}
    const out = {
      sona_pattern_count: Array.isArray(state.patterns) ? state.patterns.length : 0,
      ewc_task_count: state.ewc_task_count ?? 0,
      stateBytes,
      stateMtimeMs: stateMtime,
      rbank_pattern_count: Array.isArray(rbank) ? rbank.length : (Array.isArray(rbank?.patterns) ? rbank.patterns.length : 0),
      trajectoryCount: latest.trajectoryCount ?? 0,
      latest_exportedAt: latest.exportedAt ?? null,
      memEntries,
      stepCount: cursess.stepCount ?? 0,
      sessionId: cursess.sessionId ?? null,
      history_count: historyCount,
    };
    process.stdout.write(JSON.stringify(out));
  '
}

echo "[smoke-05] snapshotting BEFORE"
BEFORE_SNAP="$(snapshot "$BEFORE" "$LATEST_BEFORE")"
echo "  before=$BEFORE_SNAP"

# ─── Step 3: Trigger session-end / forced-learning cycle ──────────────────────
TRIGGER=""
echo "[smoke-05] triggering cycle via IPC session_end"
RESP="$(ipc '{"command":"session_end"}' || true)"
OK="$(echo "$RESP" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{ try { process.stdout.write(String(JSON.parse(s).ok === true)); } catch { process.stdout.write("false"); } })')"
if [ "$OK" = "true" ]; then
  TRIGGER="session_end"
  echo "  ok — IPC session_end accepted"
else
  echo "  session_end failed or returned non-ok; response was:"
  echo "  $RESP"
  echo "[smoke-05] falling back to force_learn"
  RESP="$(ipc '{"command":"force_learn"}' || true)"
  OK="$(echo "$RESP" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{ try { process.stdout.write(String(JSON.parse(s).ok === true)); } catch { process.stdout.write("false"); } })')"
  if [ "$OK" = "true" ]; then
    TRIGGER="force_learn"
    echo "  ok — IPC force_learn accepted"
  else
    echo "FAIL: both session_end and force_learn IPC calls failed."
    echo "  last response: $RESP"
    exit 1
  fi
fi
echo "  trigger_method=$TRIGGER"

# ─── Step 4: Wait for settle (up to 30s) ──────────────────────────────────────
BEFORE_MTIME="$(node -e 'try { process.stdout.write(String((require("fs").statSync(process.argv[1]).mtimeMs)|0)); } catch { process.stdout.write("0"); }' "$STATE" 2>/dev/null || echo 0)"
BEFORE_EXPORTED="$(node -e 'try { process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).exportedAt||""); } catch { process.stdout.write(""); }' "$LATEST_BEFORE" 2>/dev/null || echo "")"

echo "[smoke-05] waiting for settle (state.json mtime change OR new exportedAt; 30s max)"
SETTLED="no"
for i in $(seq 1 30); do
  NOW_MTIME="$(node -e 'try { process.stdout.write(String((require("fs").statSync(process.argv[1]).mtimeMs)|0)); } catch { process.stdout.write("0"); }' "$STATE" 2>/dev/null || echo 0)"
  NOW_EXPORTED="$(node -e 'try { process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).exportedAt||""); } catch { process.stdout.write(""); }' "$METRICS_LATEST" 2>/dev/null || echo "")"
  if [ "$NOW_MTIME" != "$BEFORE_MTIME" ] || [ "$NOW_EXPORTED" != "$BEFORE_EXPORTED" ]; then
    SETTLED="yes"
    echo "  settled after ${i}s"
    break
  fi
  sleep 1
done
if [ "$SETTLED" = "no" ]; then
  echo "  no filesystem delta after 30s — proceeding to snapshot anyway"
fi
# Small grace for any in-flight writes
sleep 1

# ─── Step 5: Snapshot "after" ─────────────────────────────────────────────────
cp "$STATE" "$AFTER" 2>/dev/null || echo "{}" > "$AFTER"
cp "$METRICS_LATEST" "$LATEST_AFTER" 2>/dev/null || echo "{}" > "$LATEST_AFTER"
echo "[smoke-05] snapshotting AFTER"
AFTER_SNAP="$(snapshot "$AFTER" "$LATEST_AFTER")"
echo "  after=$AFTER_SNAP"

# ─── Step 6: Diff + assert + print ────────────────────────────────────────────
echo ""
echo "[smoke-05] ─── DELTA REPORT ────────────────────────────────────────────"
BEFORE_SNAP="$BEFORE_SNAP" AFTER_SNAP="$AFTER_SNAP" TRIGGER="$TRIGGER" node -e '
  const b = JSON.parse(process.env.BEFORE_SNAP);
  const a = JSON.parse(process.env.AFTER_SNAP);
  const keys = [
    "sona_pattern_count","ewc_task_count","stateBytes","rbank_pattern_count",
    "trajectoryCount","latest_exportedAt","memEntries","stepCount","history_count",
  ];
  const pad = (s, n) => String(s).padEnd(n);
  const pads = (s, n) => String(s).padStart(n);
  console.log(pad("field", 22) + pads("before", 26) + pads("after", 26) + "  status");
  console.log("-".repeat(80));
  for (const k of keys) {
    let bv = b[k], av = a[k];
    let status = "UNCHANGED";
    if (bv === null || bv === undefined) bv = "(none)";
    if (av === null || av === undefined) av = "(none)";
    if (String(bv) !== String(av)) {
      if (typeof b[k] === "number" && typeof a[k] === "number") {
        status = a[k] > b[k] ? "PASS (grew)" : "CHANGED (shrunk)";
      } else { status = "PASS (changed)"; }
    }
    console.log(pad(k, 22) + pads(bv, 26) + pads(av, 26) + "  " + status);
  }
  // Overall: PASS if stateBytes grew OR ewc_task_count grew OR new export OR new history file.
  const stateGrew = (a.stateBytes|0) > (b.stateBytes|0);
  const ewcGrew   = (a.ewc_task_count|0) > (b.ewc_task_count|0);
  const newExport = (b.latest_exportedAt || "") !== (a.latest_exportedAt || "");
  const newHist   = (a.history_count|0)  > (b.history_count|0);
  console.log("");
  console.log("  stateBytes grew      : " + stateGrew);
  console.log("  ewc_task_count grew  : " + ewcGrew);
  console.log("  new metrics export   : " + newExport);
  console.log("  new history file     : " + newHist);
  console.log("  trigger_method       : " + process.env.TRIGGER);
  console.log("");
  const overall = (stateGrew || ewcGrew || newExport || newHist) ? "PASS" : "UNCHANGED";
  console.log("  OVERALL: " + overall);
  // Note: UNCHANGED is not a failure — a read-only trigger with no new
  // trajectories legitimately has nothing to crystallize.
'

# Step 7: exit 0 for both PASS and UNCHANGED (only trigger-failures exit 1 above).
exit 0
