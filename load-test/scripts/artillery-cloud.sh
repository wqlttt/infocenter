#!/usr/bin/env bash
# Artillery Cloud：自动读取 load-test/.artillery-key 并追加 --record
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="${ARTILLERY_KEY_FILE:-$SCRIPT_DIR/../.artillery-key}"

load_artillery_cloud_key() {
  if [[ -z "${ARTILLERY_CLOUD_API_KEY:-}" && -f "$KEY_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$KEY_FILE"
    export ARTILLERY_CLOUD_API_KEY
  fi
}

artillery_cloud_args() {
  load_artillery_cloud_key
  if [[ -n "${ARTILLERY_CLOUD_API_KEY:-}" ]]; then
    echo "--record --key $ARTILLERY_CLOUD_API_KEY"
  fi
}

print_artillery_cloud_status() {
  load_artillery_cloud_key
  if [[ -n "${ARTILLERY_CLOUD_API_KEY:-}" ]]; then
    echo "Artillery Cloud 上报：已启用（轮询/群发结果可在 app.artillery.io 查看）"
  else
    echo "Artillery Cloud 上报：未配置"
    echo "  请创建 load-test/.artillery-key 或 export ARTILLERY_CLOUD_API_KEY"
  fi
  echo "SSE 压测：仅本地 JSON（Artillery Cloud 不支持长连接测试）"
}
