#!/usr/bin/env bash
# 本地 Homebrew Mongo 单节点副本集（macOS 用 nohup 或 brew services）
set -uo pipefail

CONF="${MONGOD_CONF:-/opt/homebrew/etc/mongod.conf}"
LOG="${MONGO_LOG:-/opt/homebrew/var/log/mongodb/mongo.log}"

if ! grep -q 'replSetName: rs0' "$CONF" 2>/dev/null; then
  echo "请先在 $CONF 添加 replication.replSetName: rs0"
  exit 1
fi

if pgrep -x mongod >/dev/null; then
  echo "mongod 已在运行 (pid $(pgrep -x mongod))"
else
  echo "启动 mongod..."
  mkdir -p "$(dirname "$LOG")"
  nohup mongod --config "$CONF" >> "$LOG" 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; then
      break
    fi
  done
fi

if ! pgrep -x mongod >/dev/null; then
  echo "mongod 启动失败，查看日志: $LOG"
  tail -20 "$LOG" || true
  exit 1
fi

mongosh "mongodb://127.0.0.1:27017/admin" --quiet --eval '
try {
  const s = rs.status();
  print("副本集:", s.set, "→", s.members[0].stateStr);
} catch (e) {
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] });
  print("已执行 rs.initiate，等待 PRIMARY...");
}
' || exit 1

sleep 2
mongosh --quiet --eval 'print("最终状态:", rs.status().members[0].stateStr)' || exit 1
