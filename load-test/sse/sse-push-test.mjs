#!/usr/bin/env node
/**
 * SSE 压测：多用户长连接 + 管理员群发推送
 *
 * 用法：
 *   node load-test/sse/sse-push-test.mjs
 *   SSE_CONNECTIONS=500 node load-test/sse/sse-push-test.mjs
 *   node load-test/sse/sse-push-test.mjs --connect-only   # 仅测连接稳定性
 *
 * 前置：后端 THROTTLE_LIMIT=0；load-test/data/receiver-ids.json 已 seed
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const REPORTS_DIR = path.join(__dirname, '../reports');

const BASE_URL = process.env.LOAD_TARGET || 'http://localhost:3000';
const PASSWORD = process.env.LOAD_PASSWORD || 'demo123';
const CONNECTIONS = parseInt(process.env.SSE_CONNECTIONS || '1000', 10);
const LOGIN_CONCURRENCY = parseInt(process.env.SSE_LOGIN_CONCURRENCY || '100', 10);
const CONNECT_CONCURRENCY = parseInt(process.env.SSE_CONNECT_CONCURRENCY || '100', 10);
const PUSH_WAIT_MS = parseInt(process.env.SSE_PUSH_WAIT_MS || '60000', 10);
const CONNECT_HOLD_MS = parseInt(process.env.SSE_CONNECT_HOLD_MS || '15000', 10);
const CONNECT_ONLY = process.argv.includes('--connect-only');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarize(values) {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    count: sorted.length,
  };
}

async function login(username) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || !body.accessToken) {
    throw new Error(`${username} login 失败: ${JSON.stringify(body)}`);
  }
  return body.accessToken;
}

async function pool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function createSseParser(onEvent) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    let sep;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (!block.trim() || block.startsWith(':')) continue;
      let id;
      let data;
      for (const line of block.split('\n')) {
        if (line.startsWith('id:')) id = line.slice(3).trim();
        else if (line.startsWith('data:')) data = line.slice(5).trim();
      }
      if (data) {
        try {
          onEvent({ id, data: JSON.parse(data) });
        } catch {
          /* ignore malformed */
        }
      }
    }
  };
}

function openSseConnection(token, marker, onPush) {
  const controller = new AbortController();
  const state = {
    connected: false,
    closed: false,
    error: null,
    pushLatencyMs: null,
    received: false,
    controller,
  };

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/label-platform-admin/message/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`SSE open HTTP ${res.status}`);
      }
      state.connected = true;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const feed = createSseParser((evt) => {
        if (evt.data?.title === marker) {
          state.received = true;
          if (onPush.t0 && state.pushLatencyMs == null) {
            state.pushLatencyMs = Date.now() - onPush.t0;
          }
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        feed(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        state.error = err.message || String(err);
      }
    } finally {
      state.closed = true;
    }
  })();

  return state;
}

async function adminMassSend(receiverIds, marker) {
  const adminToken = await login('admin');
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/label-platform-admin/message/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title: marker,
      content: `SSE push test receivers=${receiverIds.length}`,
      sendMessageType: '站内信',
      receiverIds,
    }),
  });
  const body = await res.json();
  const sendMs = Date.now() - t0;
  if (!res.ok) {
    throw new Error(`群发失败 HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return { ...body, sendMs, t0 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const metaFile = path.join(DATA_DIR, 'load-users-meta.json');
  const idsFile = path.join(DATA_DIR, 'receiver-ids.json');
  if (!fs.existsSync(idsFile)) {
    console.error(`缺少 ${idsFile}，请先：cd server && yarn seed:load -- --count 500`);
    process.exit(1);
  }

  const meta = fs.existsSync(metaFile) ? loadJson(metaFile) : { pad: 6, count: 100 };
  const allIds = loadJson(idsFile);
  const n = Math.min(CONNECTIONS, allIds.length, meta.count || allIds.length);
  const pad = meta.pad || String(n).length;
  const receiverIds = allIds.slice(0, n);

  console.log(`\n=== SSE 压测 (${CONNECT_ONLY ? '仅连接' : '连接+推送'}) ===`);
  console.log(`目标: ${BASE_URL}  连接数: ${n}\n`);

  // 1. 批量登录
  const usernames = receiverIds.map((_, i) => `loadtest${String(i + 1).padStart(pad, '0')}`);
  console.log(`[1/4] 登录 ${n} 个 loadtest 用户...`);
  const loginResults = await pool(usernames, LOGIN_CONCURRENCY, async (username) => {
    try {
      const token = await login(username);
      return { username, token, ok: true };
    } catch (err) {
      return { username, ok: false, error: err.message };
    }
  });
  const loginFailed = loginResults.filter((r) => !r.ok);
  const tokens = loginResults.filter((r) => r.ok);
  console.log(`  登录成功 ${tokens.length}，失败 ${loginFailed.length}`);

  // 2. 建立 SSE 连接
  console.log(`[2/4] 建立 ${tokens.length} 条 SSE 长连接...`);
  const connectStarted = Date.now();
  const marker = CONNECT_ONLY ? null : `SSE压测-${Date.now()}`;
  const pushRef = { t0: null };

  const connections = await pool(tokens, CONNECT_CONCURRENCY, async ({ token, username }) => {
    const conn = openSseConnection(token, marker, pushRef);
    conn.username = username;
    return conn;
  });

  // 等待建连（人数越多等待越久）
  const connectDeadline = Date.now() + Math.max(60000, n * 80);
  while (Date.now() < connectDeadline) {
    const connected = connections.filter((c) => c.connected).length;
    if (connected >= tokens.length) break;
    await sleep(200);
  }
  const connectMs = Date.now() - connectStarted;
  const connected = connections.filter((c) => c.connected && !c.error);
  const connectFailed = connections.filter((c) => !c.connected || c.error);
  console.log(`  建连成功 ${connected.length}，失败 ${connectFailed.length}，耗时 ${connectMs}ms`);

  let sendResult = null;

  if (CONNECT_ONLY) {
    console.log(`[3/4] 保持连接 ${CONNECT_HOLD_MS}ms，观察稳定性...`);
    await sleep(CONNECT_HOLD_MS);
    const stillAlive = connections.filter((c) => c.connected && !c.closed && !c.error);
    console.log(`  仍存活 ${stillAlive.length}/${connected.length}`);
  } else {
    // 3. 管理员群发
    console.log(`[3/4] 管理员群发 → ${n} 收件人...`);
    pushRef.t0 = Date.now();
    sendResult = await adminMassSend(receiverIds, marker);
    console.log(`  delivered=${sendResult.delivered}，写库 HTTP ${sendResult.sendMs}ms`);

    // 4. 等待推送
    console.log(`[4/4] 等待 SSE 推送（最多 ${PUSH_WAIT_MS}ms）...`);
    const pushDeadline = Date.now() + PUSH_WAIT_MS;
    while (Date.now() < pushDeadline) {
      const received = connections.filter((c) => c.received).length;
      if (received >= connected.length) break;
      await sleep(300);
    }
  }

  const received = connections.filter((c) => c.received);
  const latencies = received.map((c) => c.pushLatencyMs).filter((v) => v != null);
  const stillAlive = connections.filter((c) => c.connected && !c.closed);

  // 清理
  for (const c of connections) {
    c.controller.abort();
  }
  await sleep(500);

  const report = {
    test: CONNECT_ONLY ? 'sse-connect' : 'sse-push',
    target: BASE_URL,
    connectionsRequested: n,
    loginOk: tokens.length,
    loginFailed: loginFailed.length,
    connected: connected.length,
    connectFailed: connectFailed.length,
    connectMs,
    stillAlive: stillAlive.length,
    ...(CONNECT_ONLY
      ? {}
      : {
          delivered: sendResult?.delivered ?? 0,
          sendMs: sendResult?.sendMs ?? 0,
          received: received.length,
          receiveFailed: connected.length - received.length,
          receiveRate: connected.length
            ? Math.round((received.length / connected.length) * 10000) / 100
            : 0,
          pushLatencyMs: summarize(latencies),
        }),
    finishedAt: new Date().toISOString(),
  };

  const outFile = path.join(
    REPORTS_DIR,
    CONNECT_ONLY ? 'sse-connect.json' : 'sse-push.json',
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log('\n--- 结果 ---');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n报告已写入 ${outFile}\n`);

  const ok = CONNECT_ONLY
    ? connectFailed.length === 0 && stillAlive.length === connected.length
    : sendResult?.delivered === n &&
      received.length === connected.length &&
      connectFailed.length === 0;

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
