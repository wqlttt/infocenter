#!/usr/bin/env bash
# 群发写库规模曲线：100 / 1k / 5k / 10k
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPORTS="$ROOT/load-test/reports"
mkdir -p "$REPORTS"
# shellcheck source=artillery-cloud.sh
source "$(dirname "$0")/artillery-cloud.sh"
print_artillery_cloud_status
CLOUD_ARGS=$(artillery_cloud_args)

SCALES="${LOAD_SCALES:-100 1000 5000 10000}"
SUMMARY="$REPORTS/send-scale-summary.json"

echo "=== 群发写库规模压测 ==="
echo "scales: $SCALES"
echo ""

for n in $SCALES; do
  echo "--- LOAD_RECEIVER_COUNT=$n ---"
  out="$REPORTS/report-send-${n}.json"
  LOAD_RECEIVER_COUNT="$n" artillery run "$ROOT/load-test/artillery/send-mass.yml" \
    --name "send-mass-${n}" \
    $CLOUD_ARGS \
    -o "$out"
  node -e "
    const r = JSON.parse(require('fs').readFileSync('$out', 'utf8'));
    const rt = r.aggregate.summaries['http.response_time'];
    const failed = r.aggregate.counters['vusers.failed'];
    console.log('  response_time.mean=' + rt.mean + 'ms failed=' + failed);
  "
  echo ""
done

node -e "
const fs = require('fs');
const path = require('path');
const scales = '$SCALES'.split(/\\s+/).map(Number);
const dir = '$REPORTS';
const rows = scales.map((n) => {
  const file = path.join(dir, 'report-send-' + n + '.json');
  if (!fs.existsSync(file)) return { receivers: n, error: true };
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    receivers: n,
    responseTime: r.aggregate.summaries['http.response_time'],
    sessionLength: r.aggregate.summaries['vusers.session_length'],
    failed: r.aggregate.counters['vusers.failed'],
  };
});
fs.writeFileSync('$SUMMARY', JSON.stringify({
  test: 'send-scale',
  scales: rows,
  finishedAt: new Date().toISOString(),
}, null, 2));
console.log('汇总 → $SUMMARY');
"
