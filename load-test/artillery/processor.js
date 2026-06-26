'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
let cachedIds = null;

function loadReceiverIds() {
  if (cachedIds) return cachedIds;
  const file = path.join(DATA_DIR, 'receiver-ids.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `缺少 ${file}，请先运行：cd server && yarn seed:load -- --count 500`,
    );
  }
  cachedIds = JSON.parse(fs.readFileSync(file, 'utf8'));
  return cachedIds;
}

function sliceCount(context) {
  const fromEnv = process.env.LOAD_RECEIVER_COUNT;
  const fromCfg = context.vars.receiverCount;
  const n = parseInt(fromEnv || fromCfg || '100', 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

function loadMeta() {
  const file = path.join(DATA_DIR, 'load-users-meta.json');
  if (!fs.existsSync(file)) return { count: 100, pad: 6 };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = {
  /** 从 receiver-ids.json 截取前 N 个收件人 */
  setReceiverIds(context, events, done) {
    try {
      const ids = loadReceiverIds();
      const count = Math.min(sliceCount(context), ids.length);
      context.vars.receiverIds = ids.slice(0, count);
      context.vars.receiverCountActual = count;
      return done();
    } catch (err) {
      return done(err);
    }
  },

  /** admin 登录，写入 adminToken */
  loginAdmin(context, events, done) {
    const baseUrl = context.vars.target || process.env.LOAD_TARGET || 'http://localhost:3000';
    const password = process.env.LOAD_PASSWORD || 'demo123';
    fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok || !body.accessToken) {
          throw new Error(`admin login 失败: ${JSON.stringify(body)}`);
        }
        context.vars.adminToken = body.accessToken;
        done();
      })
      .catch(done);
  },

  /** 轮询用：按 VU 序号映射 loadtest 用户并 login */
  loginLoadtestUser(context, events, done) {
    const baseUrl = context.vars.target || process.env.LOAD_TARGET || 'http://localhost:3000';
    const password = process.env.LOAD_PASSWORD || 'demo123';
    const meta = loadMeta();
    const count = meta.count || loadReceiverIds().length;
    const pad = meta.pad || 6;
    const vuId = typeof context.vu === 'number' ? context.vu : 1;
    const num = ((vuId - 1) % count) + 1;
    const username = `loadtest${String(num).padStart(pad, '0')}`;
    fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body, username })))
      .then(({ ok, body, username }) => {
        if (!ok || !body.accessToken) {
          throw new Error(`${username} login 失败: ${JSON.stringify(body)}`);
        }
        context.vars.memberToken = body.accessToken;
        context.vars.memberUsername = username;
        done();
      })
      .catch(done);
  },

  buildSendBody(requestParams, context, ee, next) {
    requestParams.json = {
      title: `Artillery 群发压测 ${Date.now()}`,
      content: `receiverCount=${context.vars.receiverCountActual}`,
      sendMessageType: '站内信',
      receiverIds: context.vars.receiverIds,
    };
    return next();
  },
};
