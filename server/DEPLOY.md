# InfoCenter 后端部署说明

本文档面向**生产/演示机**部署 NestJS 后端。本地开发见仓库根目录与各模块 README。

## 一、打包（在开发机执行）

```bash
cd server
yarn install
yarn package:deploy
```

产物位于 `server/release/infocenter-server-YYYYMMDD-HHMMSS.tar.gz`，内含：

| 路径 | 说明 |
|------|------|
| `dist/` | 编译后的 NestJS 代码 |
| `package.json` / `yarn.lock` | 依赖清单 |
| `.env.production.example` | 环境变量模板 |
| `DEPLOY.md` | 本说明 |
| `start.sh` | 一键安装依赖并启动 |

## 二、服务器要求

- **Node.js** 20+
- **Yarn** 1.x
- **MongoDB** 4.4+（建议与本机同机部署，`127.0.0.1:27017`）
- 开放 **API 端口**（默认 `3000`），用于 REST + **SSE 长连接**

> MongoDB **27017 不要对公网开放**。Change Stream 需副本集；单机 Mongo 会自动走 `send` 后 fallback 推送，演示环境可正常使用。

## 三、部署步骤

```bash
# 1. 上传并解压
tar -xzf infocenter-server-*.tar.gz
cd infocenter-server-*

# 2. 配置环境变量
cp .env.production.example .env
# 编辑 .env（见下一节）

# 3. 安装生产依赖
yarn install --production --ignore-engines

# 4. 首次初始化演示数据（可重复执行，会清空消息表后重建）
yarn seed:prod

# 5. 启动
yarn start:prod
# 或（会先检查 .env 是否存在）
./start.sh
```

### 后台常驻（示例）

```bash
nohup yarn start:prod >> app.log 2>&1 &
# 或使用 pm2 / systemd，按运维规范配置即可
```

## 四、环境变量（`.env`）

| 变量 | 必填 | 说明 |
|------|------|------|
| `MONGODB_URI` | 是 | 如 `mongodb://127.0.0.1:27017/infocenter` |
| `JWT_SECRET` | 是 | Access Token 签名，**生产务必改为随机长字符串** |
| `JWT_REFRESH_SECRET` | 是 | Refresh Token 签名，与上不同 |
| `JWT_ACCESS_EXPIRES` | 否 | 默认 `15m`；过期后前端弹窗要求重新登录（SSE 不自动刷新 Token） |
| `JWT_REFRESH_EXPIRES` | 否 | 默认 `7d` |
| `PORT` | 否 | 默认 `3000` |
| `CORS_ORIGIN` | 是 | 浏览器访问前端的 **Origin**，支持逗号分隔多个，例如：<br>`http://123.45.67.89:5173,http://demo.example.com` |

`main.ts` 额外放行 `localhost` / `127.0.0.1` 及 `*.devtunnels.ms`，便于本地联调。

## 五、验证

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok","mongodb":"connected"}
```

登录与消息接口前缀：`/auth/*`、`/teams/*`、`/label-platform-admin/message/*`。

## 六、防火墙与安全

| 端口 | 是否对外开放 | 说明 |
|------|----------------|------|
| `3000`（或 `PORT`） | **是** | REST + SSE |
| `27017` | **否** | MongoDB 仅本机 |
| `5173` | 视前端部署方式 | Vite 开发服务器；生产可用 Nginx 静态托管 80/443 |

- 首次部署后修改 `JWT_*`，旧 Token 全部失效，需重新登录。
- 演示账号密码见 seed 输出（默认全员 `demo123`）。

## 七、前端对接

### 开发机前端 → 远程后端

在 `client/.env.local`（或构建前 `.env.production`）设置：

```env
VITE_API_BASE_URL=http://你的公网IP:3000
```

同时把该前端访问地址（含协议、域名/IP、端口）写入后端 `CORS_ORIGIN`。

### 生产静态前端

1. `cd client && yarn build`，将 `dist/` 交给 Nginx 等静态服务。
2. 构建时注入 `VITE_API_BASE_URL=https://api.example.com`（指向本后端）。
3. `CORS_ORIGIN` 填用户浏览器里看到的站点 Origin（如 `https://app.example.com`）。

多端（SSE / 短轮询）测试：所有设备访问**同一前端地址**，共用同一后端即可。

## 八、数据库说明

`infocenter` 库主要 collection：

| Collection | 用途 |
|------------|------|
| `users` | 用户与角色（admin / leader / member） |
| `teams` | 组织与成员列表 |
| `MessageInfo` | 消息正文（群发一份） |
| `userMessageStates` | 每用户投递状态（`isRead`、`isDeleted`、`deletedAt` 软删除） |

重置演示数据：

```bash
# 整库清空后 seed（谨慎，会删掉该库全部数据）
mongosh "mongodb://127.0.0.1:27017/infocenter" --eval 'db.dropDatabase()'
yarn seed:prod
```

仅 seed 脚本也会清空 `MessageInfo` / `userMessageStates` 并重建演示消息，**不会**删除用户与团队。

## 九、消息推送相关（部署须知）

- **SSE**：`POST /label-platform-admin/message/stream`，需 CORS 允许 `Last-Event-ID` 请求头（已内置）。
- **短轮询**：`GET /label-platform-admin/message/poll`，与 SSE 二选一，由前端 ModeSwitch 切换。
- **实时下发**：副本集下用 Change Stream；单机 Mongo 在 `send` / 入团申请等走 `MessagesManager.sendMessage` 的路径上 fallback 推送。
- **删除规则**：仅**已读**消息可软删除；未读需先 `/read` 或 `/batch-read`。

## 十、演示账号（seed 后）

| 账号 | 角色 | 密码 |
|------|------|------|
| `admin` | 管理员，全员群发 | `demo123` |
| `leader` | 队长，审批入团、向队员发消息 | `demo123` |
| `member1` ~ `member10` | 成员，可发起入团申请 | `demo123` |

## 十一、常见问题

**SSE 连接 401**  
Access Token 过期（默认 15 分钟）。前端会提示重新登录；部署时可按需调大 `JWT_ACCESS_EXPIRES`，但需权衡安全。

**CORS 报错**  
检查 `CORS_ORIGIN` 是否与浏览器地址栏 Origin **完全一致**（含 `http`/`https` 与端口）。

**队长收不到入团申请**  
确认后端为最新版本（入团须走 `MessagesManager.sendMessage`）；单机 Mongo 依赖 fallback，不可只写库不推送。

**重复 seed**  
可多次执行 `yarn seed:prod`；若要完全干净的环境，先 `dropDatabase` 再 seed。
