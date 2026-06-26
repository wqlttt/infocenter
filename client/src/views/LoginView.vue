<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  ADMIN_ACCOUNT,
  LEADER_ACCOUNT,
  MEMBER_ACCOUNTS,
  getDemoRoute,
} from '@/config/demo-accounts';
import {
  bootstrapPushSession,
  resetPushSession,
  usePushBootstrap,
} from '@/composables/usePushBootstrap';
import { useSessionExpiredStore } from '@/stores/sessionExpired';
import { getApiBaseUrl } from '@/utils/api';
import axios from 'axios';

const auth = useAuthStore();
const router = useRouter();
const { isSyncing } = usePushBootstrap();
const error = ref('');
const entering = ref<string | null>(null);
const bootstrapping = ref(false);

const apiBaseUrl = getApiBaseUrl();
const backendLabel = computed(() =>
  apiBaseUrl.startsWith('http') ? '远程后端' : '本地后端（Vite 代理）',
);
const backendReachable = ref<'checking' | 'ok' | 'fail'>('checking');

onMounted(async () => {
  try {
    const { data } = await axios.get(`${apiBaseUrl}/health`, { timeout: 8000 });
    backendReachable.value = data?.status === 'ok' ? 'ok' : 'fail';
  } catch {
    backendReachable.value = 'fail';
  }
});

async function enterAs(username: string, role: 'admin' | 'leader' | 'member') {
  error.value = '';
  entering.value = username;
  bootstrapping.value = false;
  try {
    resetPushSession();
    useSessionExpiredStore().reset();
    await auth.clearSession();
    await auth.loginAsDemoUser(username);

    bootstrapping.value = true;
    // 鉴权完成后：DB 同步 -> Pinia，再仅建立 SSE 长连接
    await bootstrapPushSession();

    await router.push(getDemoRoute(role));
  } catch (e: unknown) {
    resetPushSession();
    const err = e as {
      response?: { data?: { message?: string | string[] } };
      message?: string;
      code?: string;
    };
    const msg = err.response?.data?.message;
    if (msg) {
      error.value = Array.isArray(msg) ? msg.join(', ') : String(msg);
    } else if (err.code === 'ERR_NETWORK' || !err.response) {
      error.value = `无法连接后端（${apiBaseUrl}），请确认服务已启动且网络可达`;
    } else {
      error.value = err.message ?? '进入失败';
    }
  } finally {
    entering.value = null;
    bootstrapping.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="hero">
      <h1>InfoCenter</h1>
      <p class="subtitle">选择角色一键进入，体验不同权限与 SSE / 短轮询推送</p>
      <div class="backend-banner" :class="backendReachable">
        <span class="backend-tag">{{ backendLabel }}</span>
        <code class="backend-url">{{ apiBaseUrl }}</code>
        <span class="backend-status">
          {{
            backendReachable === 'checking'
              ? '检测中…'
              : backendReachable === 'ok'
                ? '● 已连通'
                : '● 不可达'
          }}
        </span>
      </div>
    </div>

    <div class="role-grid top-row">
      <button
        class="role-card admin"
        :disabled="auth.loading || entering !== null || bootstrapping"
        @click="enterAs(ADMIN_ACCOUNT.username, 'admin')"
      >
        <span class="role-badge">{{ ADMIN_ACCOUNT.title }}</span>
        <p class="desc">{{ ADMIN_ACCOUNT.description }}</p>
        <span class="enter">
          {{ entering === ADMIN_ACCOUNT.username ? (isSyncing ? '同步消息…' : bootstrapping ? '建立 SSE…' : '进入中…') : '点击进入 →' }}
        </span>
      </button>
      <button
        class="role-card leader"
        :disabled="auth.loading || entering !== null || bootstrapping"
        @click="enterAs(LEADER_ACCOUNT.username, 'leader')"
      >
        <span class="role-badge">{{ LEADER_ACCOUNT.title }}</span>
        <p class="desc">{{ LEADER_ACCOUNT.description }}</p>
        <span class="enter">
          {{ entering === LEADER_ACCOUNT.username ? (isSyncing ? '同步消息…' : bootstrapping ? '建立 SSE…' : '进入中…') : '点击进入 →' }}
        </span>
      </button>
    </div>

    <div class="members-section">
      <h2>成员账号（member1 ~ member10）</h2>
      <p class="members-hint">
        演示共三种角色：管理员、队长（leader）、成员。队长即系统 role 字段 leader，演示账号用户名为 leader。
        可开多个浏览器窗口，分别用不同成员登录，模拟多人协作。
      </p>
      <div class="member-grid">
        <button
          v-for="account in MEMBER_ACCOUNTS"
          :key="account.username"
          class="member-chip"
          :disabled="auth.loading || entering !== null || bootstrapping"
          @click="enterAs(account.username, 'member')"
        >
          {{ entering === account.username ? '…' : account.title }}
        </button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p class="hint">登录后先同步历史消息到 Pinia，再建立 SSE 长连接 · 密码 demo123</p>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 2rem 1rem 3rem;
  background: linear-gradient(160deg, #eff6ff 0%, #f8fafc 50%, #f1f5f9 100%);
}
.hero {
  text-align: center;
  margin-bottom: 2rem;
}
h1 {
  margin: 0;
  font-size: 2rem;
}
.subtitle {
  color: #64748b;
  margin: 0.5rem 0 0;
  font-size: 1rem;
}
.backend-banner {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 0.75rem;
  margin-top: 1rem;
  padding: 0.6rem 1rem;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 4px rgb(0 0 0 / 4%);
  max-width: 100%;
}
.backend-banner.ok {
  border-color: #86efac;
  background: #f0fdf4;
}
.backend-banner.fail {
  border-color: #fca5a5;
  background: #fef2f2;
}
.backend-banner.checking {
  border-color: #fde68a;
  background: #fffbeb;
}
.backend-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  background: #f1f5f9;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}
.backend-url {
  font-size: 0.8125rem;
  color: #334155;
  word-break: break-all;
}
.backend-status {
  font-size: 0.75rem;
  font-weight: 600;
}
.backend-banner.ok .backend-status {
  color: #16a34a;
}
.backend-banner.fail .backend-status {
  color: #dc2626;
}
.backend-banner.checking .backend-status {
  color: #d97706;
}
.role-grid.top-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  max-width: 720px;
  margin: 0 auto 2rem;
}
.role-card {
  text-align: left;
  padding: 1.25rem;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 12px rgb(0 0 0 / 6%);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}
.role-card:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 10%);
}
.role-card:disabled {
  opacity: 0.7;
  cursor: wait;
}
.role-card.admin {
  border-color: #93c5fd;
}
.role-card.admin:hover:not(:disabled) {
  border-color: #2563eb;
}
.role-card.leader {
  border-color: #86efac;
}
.role-card.leader:hover:not(:disabled) {
  border-color: #16a34a;
}
.role-badge {
  display: block;
  font-weight: 700;
  font-size: 1.125rem;
  margin-bottom: 0.5rem;
}
.desc {
  color: #64748b;
  font-size: 0.875rem;
  margin: 0 0 0.75rem;
}
.enter {
  font-size: 0.875rem;
  font-weight: 600;
  color: #2563eb;
}
.role-card.leader .enter {
  color: #16a34a;
}
.members-section {
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
}
.members-section h2 {
  font-size: 1rem;
  margin: 0 0 0.35rem;
  color: #334155;
}
.members-hint {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0 0 1rem;
}
.member-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.6rem;
}
@media (max-width: 560px) {
  .member-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
.member-chip {
  padding: 0.75rem 0.5rem;
  border: 2px solid #fcd34d;
  border-radius: 10px;
  background: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  color: #92400e;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.member-chip:hover:not(:disabled) {
  background: #fffbeb;
  border-color: #d97706;
}
.member-chip:disabled {
  opacity: 0.6;
  cursor: wait;
}
.error {
  text-align: center;
  color: #dc2626;
  margin-top: 1rem;
}
.hint {
  text-align: center;
  color: #94a3b8;
  font-size: 0.75rem;
  margin-top: 1.5rem;
}
</style>
