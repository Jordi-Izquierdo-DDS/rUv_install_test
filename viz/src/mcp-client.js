// ═══════════════════════════════════════════════════════════════
// Minimal MCP HTTP JSON-RPC client for the viz server.
// Targets the claude-flow MCP HTTP daemon.
//
// Port resolution (sibling projects run on different ports):
//   1. MCP_HTTP_URL  — full URL override, takes precedence
//   2. MCP_HTTP_PORT — port only; URL built as http://localhost:${PORT}/rpc
//   3. fallback literal port 8934 — actual ruflo MCP daemon default
//      (the previous 8310 fallback was a stale historical literal that no
//       MCP server bound to → silent "0 controllers" symptom)
// ═══════════════════════════════════════════════════════════════

const MCP_PORT = process.env.MCP_HTTP_PORT || 8934;
const MCP_URL = process.env.MCP_HTTP_URL || `http://localhost:${MCP_PORT}/rpc`;

export async function callMcp(tool, args = {}, { timeoutMs = 5000 } = {}) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now() + Math.floor(Math.random() * 1000),
    method: 'tools/call',
    params: { name: tool, arguments: args },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`MCP ${tool} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`MCP ${tool}: ${json.error.message || 'unknown'}`);

  // MCP tool responses wrap content: { result: { content: [{ type:'text', text:'...JSON...' }] } }
  const content = json.result?.content;
  if (Array.isArray(content) && content[0]?.text) {
    try { return JSON.parse(content[0].text); } catch { return content[0].text; }
  }
  return json.result;
}
