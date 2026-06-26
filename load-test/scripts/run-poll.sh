#!/usr/bin/env bash
# 短轮询压测（默认 1000 人在线，与 SSE 默认对齐）
# POLL_ENVS="light heavy online1000" 可跑多档
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPORTS="$ROOT/load-test/reports"
mkdir -p "$REPORTS"
SUMMARY="$REPORTS/poll-summary.json"
POLL_ENVS="${POLL_ENVS:-online1000}"
# shellcheck source=artillery-cloud.sh
source "$(dirname "$0")/artillery-cloud.sh"
print_artillery_cloud_status
CLOUD_ARGS=$(artillery_cloud_args)

run_env() {
  local env="$1"
  local out="$REPORTS/report-poll-${env}.json"
  echo "=== poll -e $env ==="
  artillery run "$ROOT/load-test/artillery/poll.yml" -e "$env" --name "poll-${env}" $CLOUD_ARGS -o "$out"
  node -e "
    const r = JSON.parse(require('fs').readFileSync('$out', 'utf8'));
    const rt = r.aggregate.summaries['http.response_time'];
    const failed = r.aggregate.counters['vusers.failed'];
    const reqs = r.aggregate.counters['http.requests'];
    console.log('  requests=' + reqs + ' mean=' + rt.mean + 'ms p95=' + rt.p95 + 'ms failed=' + failed);
  "
}

echo "=== 短轮询压测 ==="
echo "scenarios: $POLL_ENVS"
echo ""

for env in $POLL_ENVS; do
  run_env "$env"
  echo ""
done

node -e "
const fs = require('fs');
const path = require('path');
const envs = '$POLL_ENVS'.split(/\\s+/);
const dir = '$REPORTS';
function load(env) {
  const file = path.join(dir, 'report-poll-' + env + '.json');
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    env,
    responseTime: r.aggregate.summaries['http.response_time'],
    failed: r.aggregate.counters['vusers.failed'],
    requests: r.aggregate.counters['http.requests'],
    vusersCreated: r.aggregate.counters['vusers.created'],
  };
}
const summary = { test: 'poll', finishedAt: new Date().toISOString() };
for (const e of envs) summary[e] = load(e);
fs.writeFileSync('$SUMMARY', JSON.stringify(summary, null, 2));
console.log('汇总 → $SUMMARY');
"
