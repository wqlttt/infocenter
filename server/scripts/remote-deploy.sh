#!/usr/bin/env bash
# 一键上传并部署 InfoCenter 后端到 SeetaCloud 实例
# 用法: bash scripts/remote-deploy.sh
# 首次需输入 SSH 密码；建议之后执行 ssh-copy-id 配置免密

set -euo pipefail

SSH_HOST="connect.westd.seetacloud.com"
SSH_PORT="30526"
SSH_USER="root"
REMOTE_DIR="/root/infocenter-server"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

SSH="ssh -p ${SSH_PORT} -o StrictHostKeyChecking=accept-new ${SSH_USER}@${SSH_HOST}"
SCP="scp -P ${SSH_PORT} -o StrictHostKeyChecking=accept-new"

cd "$LOCAL_ROOT"

# 1. 本地打包
if [ ! -d release ] || [ -z "$(ls -A release/infocenter-server-*.tar.gz 2>/dev/null)" ]; then
  echo ">> 本地打包..."
  yarn package:deploy
fi

ARCHIVE="$(ls -t release/infocenter-server-*.tar.gz | head -1)"
ARCHIVE_NAME="$(basename "$ARCHIVE")"
PKG_NAME="${ARCHIVE_NAME%.tar.gz}"

echo ">> 使用包: ${ARCHIVE}"
echo ">> 上传到 ${SSH_USER}@${SSH_HOST}:${SSH_PORT} ..."

$SCP "$ARCHIVE" "${SSH_USER}@${SSH_HOST}:/root/${ARCHIVE_NAME}"

echo ">> 远程解压、安装依赖、初始化..."

$SSH bash -s <<REMOTE
set -euo pipefail
ARCHIVE="/root/${ARCHIVE_NAME}"
PKG="${PKG_NAME}"
REMOTE_DIR="${REMOTE_DIR}"

# Node.js（若无则装 nvm + node 20）
export NVM_DIR="\$HOME/.nvm"
if [ ! -s "\$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
. "\$NVM_DIR/nvm.sh"
nvm install 20 >/dev/null 2>&1 || true
nvm use 20

# Yarn
if ! command -v yarn >/dev/null 2>&1; then
  npm install -g yarn
fi

# MongoDB（本机，若无则尝试安装）
if ! command -v mongod >/dev/null 2>&1; then
  echo ">> 安装 MongoDB..."
  apt-get update -qq
  apt-get install -y -qq gnupg curl
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -qq
  apt-get install -y -qq mongodb-org || apt-get install -y -qq mongodb || true
fi
if command -v mongod >/dev/null 2>&1; then
  mkdir -p /data/db /var/log/mongodb 2>/dev/null || true
  pgrep mongod >/dev/null || (mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /data/db 2>/dev/null || systemctl start mongod 2>/dev/null || true)
fi

# 解压部署包
rm -rf "\$REMOTE_DIR"
mkdir -p "\$REMOTE_DIR"
tar -xzf "\$ARCHIVE" -C /root
mv "/root/\$PKG" "\$REMOTE_DIR"
cd "\$REMOTE_DIR"

# 环境变量（首次创建）
if [ ! -f .env ]; then
  cp .env.production.example .env
  # SeetaCloud 自定义端口映射后，把 CORS_ORIGIN 改成你的前端访问地址
  sed -i 's/YOUR_SERVER_IP/connect.westd.seetacloud.com/g' .env || true
fi

yarn install --production --ignore-engines

# 首次 seed
yarn seed:prod || true

# 停掉旧进程
pkill -f 'node dist/main' 2>/dev/null || true
sleep 1

# 后台启动
nohup yarn start:prod > /root/infocenter-server.log 2>&1 &
sleep 2

echo ">> 健康检查:"
curl -s http://127.0.0.1:3000/health || echo "启动中，请稍候..."
echo ""
echo ">> 日志: tail -f /root/infocenter-server.log"
REMOTE

echo ""
echo "=========================================="
echo "  部署完成"
echo "  API: http://${SSH_HOST}:<你在面板映射的3000端口>"
echo "  日志: ssh -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'tail -f /root/infocenter-server.log'"
echo ""
echo "  SeetaCloud 请在控制台「自定义服务」把 3000 端口映射出来"
echo "  前端 .env: VITE_API_BASE_URL=http://<映射地址>:<端口>"
echo "  后端 .env CORS_ORIGIN 填前端浏览器地址栏 origin"
echo "=========================================="
