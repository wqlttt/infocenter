<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { listTeams, requestJoinTeam } from '@/service/teams';
import { useAuthStore } from '@/stores/auth';
import type { Team } from '@/types';
import { formatApiError } from '@/utils/formatApiError';

const auth = useAuthStore();
const teams = ref<Team[]>([]);
const selectedTeamId = ref('');
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const ok = ref('');

onMounted(async () => {
  loading.value = true;
  try {
    teams.value = await listTeams();
    if (teams.value.length) selectedTeamId.value = teams.value[0]._id;
  } catch (e) {
    error.value = formatApiError(e, '加载组织列表失败');
  } finally {
    loading.value = false;
  }
});

async function submit() {
  if (!selectedTeamId.value || auth.profile?.teamId) return;
  submitting.value = true;
  error.value = '';
  ok.value = '';
  try {
    await requestJoinTeam(selectedTeamId.value);
    ok.value = '申请已发送，队长将在消息中心收到通知（含跳转链接）';
  } catch (e) {
    error.value = formatApiError(e, '申请失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="join-panel">
    <div class="join-head">
      <span class="icon">👥</span>
      <div>
        <h3>申请加入组织</h3>
        <p class="hint">向队长发送入团申请，队长可在消息中点击链接跳转（演示：Google）</p>
      </div>
    </div>

    <div v-if="auth.profile?.teamId" class="state ok">您已在组织中，无需重复申请</div>
    <div v-else-if="loading" class="state">加载组织…</div>
    <form v-else class="join-form" @submit.prevent="submit">
      <label class="field">
        <span>选择组织</span>
        <select v-model="selectedTeamId">
          <option v-for="t in teams" :key="t._id" :value="t._id">{{ t.name }}</option>
        </select>
      </label>
      <button type="submit" class="submit" :disabled="submitting || !selectedTeamId">
        {{ submitting ? '提交中…' : '发起入团申请' }}
      </button>
    </form>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="ok" class="ok-msg">{{ ok }}</p>
  </div>
</template>

<style scoped>
.join-panel {
  background: linear-gradient(180deg, #faf5ff 0%, #fff 40%);
  border: 1px solid #e9d5ff;
  border-radius: 16px;
  padding: 1rem 1.1rem;
  margin-bottom: 1rem;
}
.join-head {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.85rem;
}
.join-head .icon {
  font-size: 1.75rem;
}
.join-head h3 {
  margin: 0 0 0.15rem;
  font-size: 1rem;
}
.hint {
  margin: 0;
  font-size: 0.75rem;
  color: #64748b;
}
.join-form {
  margin: 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: #475569;
  margin-bottom: 0.65rem;
}
select {
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
}
.submit {
  width: 100%;
  padding: 0.6rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.state {
  font-size: 0.875rem;
  color: #64748b;
}
.state.ok {
  color: #047857;
  background: #ecfdf5;
  padding: 0.65rem;
  border-radius: 10px;
}
.err {
  margin: 0.5rem 0 0;
  color: #dc2626;
  font-size: 0.8125rem;
}
.ok-msg {
  margin: 0.5rem 0 0;
  color: #047857;
  font-size: 0.8125rem;
}
</style>
