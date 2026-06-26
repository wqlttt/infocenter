#!/usr/bin/env bash
# SSE vs 短轮询 对称对比：10000 人在线
#
#   bash load-test/scripts/run-compare-10000.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

export SSE_CONNECTIONS="${SSE_CONNECTIONS:-10000}"
export POLL_ENVS="${POLL_ENVS:-online10000}"
export SSE_LOGIN_CONCURRENCY="${SSE_LOGIN_CONCURRENCY:-200}"
export SSE_CONNECT_CONCURRENCY="${SSE_CONNECT_CONCURRENCY:-200}"
export SSE_PUSH_WAIT_MS="${SSE_PUSH_WAIT_MS:-180000}"
export SSE_CONNECT_HOLD_MS="${SSE_CONNECT_HOLD_MS:-15000}"

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

# 确认 seed 用户足够
need="$SSE_CONNECTIONS"
have=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT/load-test/data/receiver-ids.json','utf8')).length)")
if [[ "$have" -lt "$need" ]]; then
  echo "receiver-ids 仅 $have 个，请先：cd server && yarn seed:load -- --count $need"
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
const out = path.join(dir, 'compare-10000-summary.json');
const summary = {
  test: 'compare-10000',
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
