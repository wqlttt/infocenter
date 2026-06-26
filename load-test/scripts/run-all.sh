#!/usr/bin/env bash
# 全套压测：群发规模 + 短轮询 + SSE
#
# 前置（终端 A）：
#   bash server/scripts/init-mongo-rs.sh
#   cd server && THROTTLE_LIMIT=0 JSON_BODY_LIMIT=10mb yarn start:dev
#
# 用法：
#   bash load-test/scripts/run-all.sh
#   bash load-test/scripts/run-all.sh --skip-scale   # 跳过 10k 规模曲线
#   bash load-test/scripts/run-compare-1000.sh       # 仅 SSE vs 轮询 1000 人对比
#   SSE_CONNECTIONS=1000 bash load-test/scripts/run-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPORTS="$ROOT/load-test/reports"
mkdir -p "$REPORTS"

export SSE_CONNECTIONS="${SSE_CONNECTIONS:-1000}"
export POLL_ENVS="${POLL_ENVS:-online1000}"

TARGET="${LOAD_TARGET:-http://localhost:3000}"
# shellcheck source=artillery-cloud.sh
source "$(dirname "$0")/artillery-cloud.sh"
print_artillery_cloud_status
echo ""
SKIP_SCALE=false
for arg in "$@"; do
  [[ "$arg" == "--skip-scale" ]] && SKIP_SCALE=true
done

echo "检查后端 $TARGET/health ..."
if ! curl -sf "$TARGET/health" > /dev/null; then
  echo "后端未就绪。请先启动："
  echo "  cd server && THROTTLE_LIMIT=0 JSON_BODY_LIMIT=10mb yarn start:dev"
  exit 1
fi
echo "OK"
echo ""

START=$(date +%s)

if [[ "$SKIP_SCALE" == false ]]; then
  bash "$ROOT/load-test/scripts/run-send-scale.sh"
else
  echo "跳过群发规模曲线 (--skip-scale)"
fi

echo ""
bash "$ROOT/load-test/scripts/run-poll.sh"

echo ""
bash "$ROOT/load-test/scripts/run-sse.sh"

END=$(date +%s)
node -pe "
const fs = require('fs');
const path = require('path');
const dir = '$REPORTS';
const files = ['send-scale-summary.json','poll-summary.json','sse-connect.json','sse-push.json'];
const summary = { test: 'run-all', durationSec: $END - $START, finishedAt: new Date().toISOString(), reports: {} };
for (const f of files) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) summary.reports[f] = JSON.parse(fs.readFileSync(p, 'utf8'));
}
const out = path.join(dir, 'run-all-summary.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log('全套汇总 → ' + out);
"
