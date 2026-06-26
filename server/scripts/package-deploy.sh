#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ">> Building..."
yarn build

VERSION="$(date +%Y%m%d-%H%M%S)"
PKG_NAME="infocenter-server-${VERSION}"
STAGE="$(mktemp -d)"
PKG_DIR="${STAGE}/${PKG_NAME}"
OUT_DIR="${ROOT}/release"

mkdir -p "$PKG_DIR" "$OUT_DIR"

cp package.json yarn.lock DEPLOY.md .env.production.example "$PKG_DIR/"
cp -r dist "$PKG_DIR/"

cat > "$PKG_DIR/start.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  echo "请先复制 .env.production.example 为 .env 并修改配置"
  exit 1
fi
yarn install --production --ignore-engines
exec yarn start:prod
EOF
chmod +x "$PKG_DIR/start.sh"

# 清除 macOS 扩展属性，避免 Linux tar 报 LIBARCHIVE.xattr 警告
xattr -cr "$PKG_DIR" 2>/dev/null || true

ARCHIVE="${OUT_DIR}/${PKG_NAME}.tar.gz"
if tar --disable-copyfile -czf "$ARCHIVE" -C "$STAGE" "$PKG_NAME" 2>/dev/null; then
  :
else
  COPYFILE_DISABLE=1 tar -czf "$ARCHIVE" -C "$STAGE" "$PKG_NAME"
fi
rm -rf "$STAGE"

echo ">> Done: ${ARCHIVE}"
ls -lh "$ARCHIVE"
