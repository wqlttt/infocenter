# InfoCenter

消息中心 Demo：NestJS + MongoDB 后端，Vue 3 + Vite 前端。支持 **SSE 实时推送** 与 **短轮询** 两种模式，以及 admin / leader / member 角色与团队入团流程。

## 环境要求

| 依赖 | 版本建议 |
|------|----------|
| Node.js | 20+ |
| Yarn | 1.x / 3.x |
| MongoDB | 6+（本地单节点即可） |

## 快速开始（本地开发）

### 1. 克隆仓库

```bash
git clone git@github.com:wqlttt/infocenter.git
cd infocenter
```

### 2. 启动 MongoDB

确保 MongoDB 运行在本地，默认连接：

```text
mongodb://127.0.0.1:27017/infocenter
```

### 3. 配置后端

```bash
cd server
cp .env.example .env
yarn install
yarn seed          # 写入演示用户、团队、消息
yarn start:dev     # http://localhost:3000
```

### 4. 配置并启动前端

新开一个终端：

```bash
cd client
cp .env.example .env
yarn install
yarn dev           # http://localhost:5173
```

前端通过 Vite 代理访问后端：`/api` → `http://localhost:3000`（见 `client/vite.config.ts`）。

### 5. 打开浏览器

访问 [http://localhost:5173](http://localhost:5173)，使用下方演示账号登录。

---

## 演示账号

执行 `yarn seed` 后，**所有账号密码均为 `demo123`**：

| 账号 | 角色 | 说明 |
|------|------|------|
| `admin` | 管理员 | 用户列表、创建团队、全员发消息 |
| `leader` | 队长 | 审批入团、给队员发消息 |
| `member1` ~ `member10` | 队员 | 收消息；未入队成员可发起入团申请 |

重置演示数据（会清空消息，保留用户/团队结构，并重建 seed 消息）：

```bash
cd server
yarn seed
```

整库清空后重新 seed：

```bash
mongosh "mongodb://127.0.0.1:27017/infocenter" --eval 'db.dropDatabase()'
cd server && yarn seed
```

---

## 生产构建

### 后端

```bash
cd server
yarn install
yarn build
yarn start:prod      # 运行 dist/main.js
```

生产环境 seed（需先 `yarn build`）：

```bash
yarn seed:prod
```

打包部署目录（含脚本与示例 env）：

```bash
yarn package:deploy
```

### 前端

```bash
cd client
yarn install
yarn build             # 产物在 client/dist
yarn preview           # 本地预览静态站
```

生产部署时请将 `VITE_API_BASE_URL` 指向实际后端地址（见 `client/.env.example`）。

---

## 主要能力

- **认证**：JWT（access 15m + refresh 7d）
- **消息**：站内信；SSE 长连接 + 短轮询；软删除（须先已读）
- **团队**：队员入团申请 → 队长收实时通知 → 审批
- **角色**：admin / leader / member，权限由 JWT 内 `role` 决定

健康检查：

```bash
curl http://localhost:3000/health
```

---

## 目录结构

```text
infocenter/
├── client/          # Vue 3 前端
├── server/          # NestJS 后端
│   ├── src/
│   └── scripts/     # 部署打包脚本
└── README.md
```

---

## 常见问题

**前端 401 / SSE 连不上**  
accessToken 约 15 分钟过期，重新登录即可。SSE 不走 axios 自动刷新，长时间挂页需重新登录。

**本地 Mongo 下单机无 Change Stream**  
服务端会在发消息、入团申请等路径走 fallback，仍可通过 SSE 推送；消息本身会正常写入数据库。

**队员入团 400 Already assigned to a team**  
该 member 已在团队中；换 `member10` 等未入队账号测试。

---

## License

Private demo project.
