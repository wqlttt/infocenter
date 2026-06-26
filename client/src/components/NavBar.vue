<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
import { resetPushSession } from '@/composables/usePushBootstrap';
import NotificationBell from '@/components/NotificationBell.vue';
import { roleLabel } from '@/utils/roleLabel';
import { useRouter } from 'vue-router';

const auth = useAuthStore();
const router = useRouter();

async function switchAccount() {
  resetPushSession();
  await auth.clearSession();
  router.push('/login');
}
</script>

<template>
  <nav class="navbar">
    <span class="brand">InfoCenter</span>
    <NotificationBell />
    <span v-if="auth.profile" class="user">
      {{ auth.profile.username }}
      <span class="role-tag">{{ roleLabel(auth.profile.role) }}</span>
    </span>
    <button @click="switchAccount">切换角色</button>
  </nav>
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #1e293b;
  color: #fff;
  margin-bottom: 1rem;
  border-radius: 8px;
}
.brand {
  font-weight: 700;
}
.user {
  margin-left: auto;
  font-size: 0.875rem;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.role-tag {
  background: #334155;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}
button {
  padding: 0.35rem 0.75rem;
  border: none;
  background: #475569;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
}
button:hover {
  background: #64748b;
}
</style>
