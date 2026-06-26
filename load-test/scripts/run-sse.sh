#!/usr/bin/env bash
# SSE：默认 1000 长连接 + 群发推送
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export LOAD_TARGET="${LOAD_TARGET:-http://localhost:3000}"
N="${SSE_CONNECTIONS:-1000}"

echo "=== SSE 连接稳定性 (${N} 人) ==="
SSE_CONNECTIONS="$N" node "$ROOT/load-test/sse/sse-push-test.mjs" --connect-only

echo ""
echo "=== SSE 群发推送 (${N} 人) ==="
SSE_CONNECTIONS="$N" node "$ROOT/load-test/sse/sse-push-test.mjs"
