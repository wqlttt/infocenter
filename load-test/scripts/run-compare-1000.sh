#!/usr/bin/env bash
# SSE vs 短轮询 对称对比（默认各 1000 人在线）
#
#   bash load-test/scripts/run-compare-1000.sh
#   SSE_CONNECTIONS=1000 POLL_ENVS=online1000 bash load-test/scripts/run-compare-1000.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export SSE_CONNECTIONS="${SSE_CONNECTIONS:-1000}"
export POLL_ENVS="${POLL_ENVS:-online1000}"

TARGET="${LOAD_TARGET:-http://localhost:3000}"
# shellcheck source=artillery-cloud.sh
source "$(dirname "$0")/artillery-cloud.sh"
echo "=== SSE vs 轮询 对称压测 (${SSE_CONNECTIONS} 人) ==="
echo "target: $TARGET"
print_artillery_cloud_status
echo ""

if ! curl -sf "$TARGET/health" >/dev/null; then
  echo "后端未就绪，请先启动 server"
  exit 1
fi

START=$(date +%s)
bash "$ROOT/load-test/scripts/run-poll.sh"
echo ""
bash "$ROOT/load-test/scripts/run-sse.sh"
END=$(date +%s)

node -e "
const fs = require('fs');
const path = require('path');
const dir = path.join('$ROOT', 'load-test/reports');
const out = path.join(dir, 'compare-1000-summary.json');
const summary = {
  test: 'compare-1000',
  onlineUsers: $SSE_CONNECTIONS,
  durationSec: $END - $START,
  finishedAt: new Date().toISOString(),
};
for (const f of ['poll-summary.json', 'sse-connect.json', 'sse-push.json']) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) summary[f.replace('.json','')] = JSON.parse(fs.readFileSync(p, 'utf8'));
}
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log('');
console.log('对比汇总 → ' + out);
"
