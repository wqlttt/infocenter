<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';
import { useOutboxStore } from '@/stores/outbox';
import { useSseStore } from '@/stores/sse';
import SseDebugPanel from '@/components/SseDebugPanel.vue';
import type { PushMode } from '@/types';

const props = defineProps<{
  mode: PushMode;
  isConnected?: boolean;
  isSyncing?: boolean;
  syncCount?: number;
  pollCount?: number;
  nextPollIn?: number;
  pollHasMore?: boolean;
  apiOnline?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:mode', v: PushMode): void }>();

const messagesStore = useMessagesStore();
const authStore = useAuthStore();
const outboxStore = useOutboxStore();
const sseStore = useSseStore();
const { phase, demoPauseRemaining } = storeToRefs(sseStore);
const { pending: outboxPending } = storeToRefs(outboxStore);

const sseStatusText = computed(() => {
  if (demoPauseRemaining.value > 0) {
    return `演示断连中，${demoPauseRemaining.value}s 后自动重连…`;
  }
  if (props.isSyncing) {
    return '正在从数据库同步历史消息…';
  }
  if (phase.value === 'connecting' || phase.value === 'reconnecting') {
    return phase.value === 'reconnecting' ? '正在重连 SSE…' : '正在建立 SSE 长连接…';
  }
  if (props.isConnected) {
    return 'SSE 长连接已建立';
  }
  return '已断开，等待重连…';
});

function setMode(mode: PushMode) {
  if (props.mode === mode) return;
  emit('update:mode', mode);
}
</script>

<template>
  <div class="mode-switch card">
    <div class="toggle-row">
      <span>推送模式:</span>
      <button type="button" :class="{ active: mode === 'sse' }" @click="setMode('sse')">SSE 实时推送</button>
      <button type="button" :class="{ active: mode === 'polling' }" @click="setMode('polling')">短轮询</button>
    </div>
    <div class="api-row">
      <span class="api-badge" :class="apiOnline ? 'api-ok' : 'api-down'">
        API {{ apiOnline ? '在线' : '离线' }}
      </span>
      <span v-if="outboxPending.length" class="outbox-badge">
        待发 {{ outboxPending.length }} 条
      </span>
    </div>
    <div v-if="mode === 'sse'" class="status sse">
      <span
        class="dot"
        :class="demoPauseRemaining > 0 ? 'orange' : isConnected ? 'green' : 'pending'"
      />
      {{ sseStatusText }}
      · 同步 {{ syncCount ?? 0 }} 次
      · {{ authStore.profile?.username ?? '?' }}
      · 未读 {{ messagesStore.unreadCount }}
    </div>
    <div v-else class="status poll">
      <span class="dot orange" />
      每 15 秒增量轮询 · 下次 {{ nextPollIn ?? 15 }}s · 已发 {{ pollCount ?? 0 }} 次
      <span v-if="pollHasMore" class="has-more">· 有新消息积压，请刷新列表</span>
    </div>

    <SseDebugPanel v-if="mode === 'sse'" :is-syncing="isSyncing" />
  </div>
</template>

<style scoped>
.mode-switch { margin-bottom: 1rem; }
.toggle-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
button {
  padding: 0.35rem 0.75rem;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}
button.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}
.api-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
}
.api-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
}
.api-ok { background: #ecfdf5; color: #047857; }
.api-down { background: #fef2f2; color: #b91c1c; }
.outbox-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background: #fff7ed;
  color: #c2410c;
  font-weight: 600;
}
.status {
  font-size: 0.875rem;
  color: #475569;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.green { background: #22c55e; animation: pulse 1.5s infinite; }
.pending { background: #f59e0b; animation: pulse 1.5s infinite; }
.orange { background: #f97316; }
.has-more { color: #b45309; font-weight: 600; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
