# InfoCenter 消息中心：SSE 与短轮询性能对比报告

> **测试日期**：2026-06-26  
> **环境**：本地 NestJS + MongoDB 副本集（rs0）  
> **结论摘要**：1000 人规模下两种模式均稳定；SSE 实时性显著优于轮询，轮询单次读更轻；写库路径 1w 群发约 244ms。1w 全量对称压测因单机连接上限未完成 SSE 部分。

---

## 1. 两种模式说明

InfoCenter 消息中心通过前端 **ModeSwitch** 在两种到达方式间切换，**写库路径相同**，差异在**读侧/推送侧**。

| | **SSE** | **短轮询** |
|---|---------|-----------|
| **接口** | `POST /label-platform-admin/message/stream` | `GET /label-platform-admin/message/poll` |
| **机制** | 长连接；Mongo Change Stream → 服务端 `res.write` 主动推送 | 客户端每 **15s** 发起 HTTP 短请求拉增量 |
| **实时性** | 秒级（实测 p50 ~0.5s） | 取决于间隔（15s → 平均感知延迟 ~7.5s） |
| **服务端代价** | N 条长连接 + 内存 + 推送 fan-out | 无长连接；`在线人数 / 15s` 的读库 QPS |
| **压测工具** | Node 脚本（Artillery 不支持长连接） | Artillery 2.x |

---

## 2. 测试环境与方法

### 2.1 环境

| 项目 | 配置 |
|------|------|
| 后端 | `THROTTLE_LIMIT=0`，`JSON_BODY_LIMIT=10mb` |
| 数据库 | `mongodb://127.0.0.1:27017/infocenter?replicaSet=rs0` |
| 用户 | `loadtest00001` … `loadtest10000`，密码 `demo123` |
| 可视化 | Artillery Cloud（轮询/群发）；SSE 仅本地 JSON |

### 2.2 前置命令

```bash
bash server/scripts/init-mongo-rs.sh
cd server && yarn seed:load -- --count 10000
cd server && THROTTLE_LIMIT=0 JSON_BODY_LIMIT=10mb yarn start:dev
```

### 2.3 压测脚本

| 脚本 | 用途 |
|------|------|
| `load-test/scripts/run-compare-1000.sh` | **1000 人** SSE vs 轮询对称对比（今日主结论来源） |
| `load-test/scripts/run-compare-10000.sh` | 10000 人对比（轮询已跑；SSE 未完成） |
| `load-test/scripts/run-send-scale.sh` | 群发写库 100 / 1k / 5k / 10k |
| `load-test/artillery/poll.yml` | 轮询场景：`online1000`、`online10000` |
| `load-test/sse/sse-push-test.mjs` | SSE 建连 + 群发推送 |

Artillery 结果可上传 Cloud：在 `load-test/.artillery-key` 配置 `ARTILLERY_CLOUD_API_KEY` 后自动 `--record`。

---

## 3. 测试结果

### 3.1 写路径（两种模式共用）

单次 admin 群发，收件人数递增（`send-mass.yml`）：

| 收件人数 | 写库 HTTP 延迟 | 失败 |
|---------|---------------|------|
| 100 | 28 ms | 0 |
| 1,000 | 65 ms | 0 |
| 5,000 | 167 ms | 0 |
| **10,000** | **244 ms** | 0 |

写库随人数近似线性增长；**1w 群发在本机约 0.24s 返回**，不是 SSE/轮询的分歧点。

---

### 3.2 对称对比：1000 人在线 ✅（完整）

> 报告：`load-test/reports/compare-1000-summary.json`  
> Cloud 轮询：[poll-online1000](https://app.artillery.io/oaehr4zyv547z/load-tests/tdm3n_dqqf6cjbdzccabaedtq989g5nz8c9_c8zb)

#### 短轮询 `online1000`

- 场景：120s 内 `arrivalRate=10` 拉起，上限 1000 VU；每用户登录后 **4 次** `GET /poll`，间隔 15s

| 指标 | 结果 |
|------|------|
| 虚拟用户 | 1184 |
| 总请求 | 4736 |
| mean / p95 / p99 | **5 ms / 7 ms / 24.8 ms** |
| 失败 | **0** |

#### SSE 1000 长连接

| 指标 | 连接稳定性 | 群发推送 |
|------|-----------|----------|
| 登录 / 建连 | 1000/1000 | 1000/1000 |
| 建连耗时 | ~1.6s | ~1.6s |
| 15s 后仍存活 | **1000/1000** | — |
| 推送到达 | — | **1000/1000（100%）** |
| 写库 HTTP | — | 72 ms |
| 推送延迟 p50 / p95 | — | **544 ms / 617 ms** |
| 失败 | **0** | **0** |

---

### 3.3 规模探测：10000 人 ⚠️（部分完成）

> 报告：`load-test/reports/compare-10000.log`  
> Cloud 轮询：[poll-online10000](https://app.artillery.io/oaehr4zyv547z/load-tests/thpaq_fzydrkn6p7qcbf9pmymnpwe7dd7h9_m758)

#### 短轮询 `online10000`（已完成，有失败）

- 场景：200s 内 `arrivalRate=50` 拉起，上限 10000 VU

| 指标 | 结果 |
|------|------|
| 虚拟用户创建 | 10,000 |
| 场景完成 | 5,432 |
| **登录/请求失败** | **4,568**（`fetch failed`，瞬时连接过多） |
| 成功请求 | 21,728 |
| mean / p95 / p99（成功部分） | **7.4 ms / 15 ms / 61 ms** |
| 耗时 | ~8 分钟 |

#### SSE 10000（未完成）

- 轮询结束后进入 SSE 批量登录阶段，**后端连接数打满**（3000 端口 400+ 连接），登录长时间无响应，测试中止。
- **结论**：单机单进程不宜同时模拟 1w 轮询 VU + 1w SSE 长连接；后续需降并发、分阶段跑，或多实例/压测机。

---

## 4. SSE vs 短轮询：对比分析

### 4.1 核心指标对照（以 1000 人完整数据为准）

| 维度 | SSE | 短轮询 | 谁更合适 |
|------|-----|--------|----------|
| **用户感知延迟** | 推送 p50 **544ms** | 15s 间隔 → 最坏 15s，平均 ~7.5s | **SSE** |
| **单次 HTTP 读延迟** | — | mean **5ms**，p95 **7ms** | **轮询**（接口极轻） |
| **1000 人稳定性** | 1000/1000 建连、推送 | 4736 次请求，0 失败 | **均可** |
| **10000 人稳定性** | 未测完 | 54% 完成，46% 登录失败 | **均需优化场景** |
| **长连接 / 内存** | 每在线用户 1 连接 | 无 | **轮询** |
| **持续读库压力** | 平时低（Change Stream 推送） | ~**N/15 req/s**（1000 人 ≈ 66/s） | **SSE** |
| **网关 / 运维** | 需 SkipThrottle、防代理断连 | 普通 REST | **轮询** |
| **压测可视化** | 本地 JSON | Artillery Cloud | **轮询** |

### 4.2 压力模型

```
                    ┌── Change Stream ──┐
                    ▼                   │
群发 POST /send ──► MongoDB ────────────┤
                    │                   │
         ┌──────────┴──────────┐        │
         ▼                     ▼        ▼
    SSE: N 长连接          轮询: 每 15s
    Subject → res.write    GET /poll → 查库
    实时 ~0.5s             延迟 ~秒~十秒级
```

- **SSE**：用**连接资源**换**实时性**和**低读库 QPS**。
- **短轮询**：用**周期性读库**换**无状态、易部署**。

### 4.3 综合结论

1. **1000 在线用户**：两种模式在本机均表现良好，可作为当前架构的参考上限。
2. **实时性**：SSE 推送 p50 ~0.5s，远优于 15s 轮询，适合站内信、红点。
3. **读性能**：轮询单次 mean 5ms，1000 人 @ 15s 下 Mongo 读路径余量充足。
4. **写性能**：1w 群发 244ms，与推送方式无关。
5. **架构建议**：**SSE 主路径 + 短轮询降级**（与现有 ModeSwitch 一致）。
6. **1w 规模**：写库已验证；**读侧/连接侧**需生产多实例或更温和压测参数，不宜单机硬拉 1w 长连接。

---

## 5. 今日测试清单

| 项目 | 规模 | 状态 | 关键结果 |
|------|------|------|----------|
| 群发写库 | 100 ~ 10k | ✅ | 10k → 244ms，0 失败 |
| 轮询 | 1000 人 | ✅ | mean 5ms，0 失败 |
| SSE 建连 + 推送 | 1000 人 | ✅ | 100% 到达，p50 544ms |
| 轮询 | 10000 人 | ⚠️ | 54% 完成；成功请求 mean 7.4ms |
| SSE | 10000 人 | ❌ | 后端过载，未完成 |

---

## 6. 复现与报告路径

```bash
# 推荐：1000 人对称对比
bash load-test/scripts/run-compare-1000.sh

# 10000 人（轮询可跑完；SSE 需后端空闲 + 降并发）
bash load-test/scripts/run-compare-10000.sh

# 查看汇总
cat load-test/reports/compare-1000-summary.json
cat load-test/reports/compare-10000.log
```

| 报告 | 路径 |
|------|------|
| 1000 对比汇总 | `load-test/reports/compare-1000-summary.json` |
| 10000 日志 | `load-test/reports/compare-10000.log` |
| SSE 明细 | `load-test/reports/sse-connect.json`、`sse-push.json` |
| 轮询明细 | `load-test/reports/report-poll-online1000.json` 等 |

---

## 7. 后续（改日）

- 1w SSE：降低 `SSE_LOGIN_CONCURRENCY`，分阶段建连；或换压测机
- 1w 轮询：降低 `arrivalRate`，避免登录风暴
- 多实例 Nest + 负载均衡 + SSE sticky session
- JWT 15min 过期后的批量 SSE 重连

---

*文档对应代码与脚本位于 `load-test/` 目录。*
