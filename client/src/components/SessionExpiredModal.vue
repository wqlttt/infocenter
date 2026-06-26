<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSessionExpiredStore } from '@/stores/sessionExpired';
import { resetPushSession } from '@/composables/usePushBootstrap';

const router = useRouter();
const auth = useAuthStore();
const sessionExpired = useSessionExpiredStore();
const { visible } = storeToRefs(sessionExpired);

async function goLogin() {
  resetPushSession();
  await auth.clearSession();
  sessionExpired.reset();
  await router.push('/login');
}
async function reloadPage() {
  window.location.reload();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="backdrop">
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="expired-title">
          <div class="icon-wrap" aria-hidden="true">⏱</div>
          <h2 id="expired-title">登录已过期</h2>
          <p class="desc">您的登录状态已失效，实时消息推送已断开。请刷新页面后重新登录以继续使用。</p>
          <div class="actions">
            <button type="button" class="btn primary" @click="goLogin">重新登录</button>
            <button type="button" class="btn ghost" @click="reloadPage">刷新页面</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgb(15 23 42 / 0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}
.modal {
  width: min(22rem, 100%);
  background: #fff;
  border-radius: 20px;
  padding: 1.75rem 1.5rem 1.5rem;
  text-align: center;
  box-shadow: 0 24px 48px rgb(15 23 42 / 22%);
}
.icon-wrap {
  width: 3rem;
  height: 3rem;
  margin: 0 auto 0.75rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
h2 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
  color: #0f172a;
}
.desc {
  margin: 0 0 1.25rem;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #64748b;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.btn {
  width: 100%;
  padding: 0.65rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.btn.primary {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
}
.btn.ghost {
  background: #f1f5f9;
  color: #475569;
}
.btn:hover {
  filter: brightness(0.97);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
