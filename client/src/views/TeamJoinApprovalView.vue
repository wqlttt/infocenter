<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import { approveTeamMember } from '@/service/teams';
import { useAuthStore } from '@/stores/auth';
import { formatApiError } from '@/utils/formatApiError';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const userId = computed(() => String(route.query.userId ?? ''));
const username = computed(() => String(route.query.username ?? '成员'));
const teamId = computed(() => String(route.query.teamId ?? ''));
const teamName = computed(() => String(route.query.teamName ?? '组织'));

const busy = ref(false);
const done = ref(false);
const error = ref('');
const result = ref('');

const valid = computed(() => userId.value && teamId.value);

async function approve() {
  if (!valid.value || busy.value || done.value) return;
  busy.value = true;
  error.value = '';
  try {
    const res = await approveTeamMember(teamId.value, userId.value);
    done.value = true;
    result.value = `已同意 ${res.username} 加入「${res.teamName}」`;
  } catch (e) {
    error.value = formatApiError(e, '审批失败');
  } finally {
    busy.value = false;
  }
}

function goBack() {
  void router.push(auth.profile?.role === 'admin' ? '/admin' : '/leader');
}

onMounted(() => {
  if (!valid.value) error.value = '链接参数不完整，请从消息中心重新进入';
});
</script>

<template>
  <div class="page">
    <NavBar />
    <div class="approval-card">
      <div class="card-hero">
        <span class="icon">👥</span>
        <p class="eyebrow">入团申请审批</p>
        <h1>{{ username }}</h1>
        <p class="sub">申请加入 <strong>{{ teamName }}</strong></p>
      </div>

      <div class="card-body">
        <div v-if="!valid" class="alert warn">{{ error }}</div>
        <div v-else-if="done" class="alert ok">{{ result }}</div>
        <template v-else>
          <p class="desc">
            确认同意后，该成员将加入您的组织，并可接收团队相关任务通知。
          </p>
          <div v-if="error" class="alert err">{{ error }}</div>
          <div class="actions">
            <button type="button" class="btn ghost" :disabled="busy" @click="goBack">稍后再说</button>
            <button type="button" class="btn primary" :disabled="busy" @click="approve">
              {{ busy ? '处理中…' : '同意入团' }}
            </button>
          </div>
        </template>
        <button v-if="done || !valid" type="button" class="btn link" @click="goBack">返回消息中心</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 0 1rem 2rem;
}
.approval-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgb(15 23 42 / 10%);
  border: 1px solid #e2e8f0;
}
.card-hero {
  padding: 2rem 1.5rem 1.25rem;
  text-align: center;
  background: linear-gradient(160deg, #ede9fe 0%, #fff 55%);
}
.icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.5rem;
}
.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #7c3aed;
}
.card-hero h1 {
  margin: 0.25rem 0;
  font-size: 1.5rem;
  color: #0f172a;
}
.sub {
  margin: 0;
  color: #64748b;
  font-size: 0.9375rem;
}
.card-body {
  padding: 1.25rem 1.5rem 1.5rem;
}
.desc {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #475569;
}
.actions {
  display: flex;
  gap: 0.65rem;
}
.btn {
  flex: 1;
  padding: 0.65rem 1rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn.primary {
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  box-shadow: 0 4px 14px rgb(124 58 237 / 35%);
}
.btn.ghost {
  background: #f1f5f9;
  color: #475569;
}
.btn.link {
  width: 100%;
  margin-top: 0.75rem;
  background: transparent;
  color: #2563eb;
}
.alert {
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}
.alert.ok {
  background: #ecfdf5;
  color: #047857;
}
.alert.err {
  background: #fef2f2;
  color: #b91c1c;
}
.alert.warn {
  background: #fffbeb;
  color: #b45309;
}
</style>
