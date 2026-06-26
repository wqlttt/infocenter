<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';
import { useSseStore } from '@/stores/sse';
import type { SseJournalEntry } from '@/types/sse-debug';

defineProps<{ isSyncing?: boolean }>();

const authStore = useAuthStore();
const messagesStore = useMessagesStore();
const sseStore = useSseStore();

const {
  phase,
  isConnected,
  streamCount,
  connectionDuration,
  catchUpCount,
  liveCount,
  dedupSkipCount,
  journal,
  demoPauseRemaining,
  lastRetryDelay,
  reconnectAttempt,
  debugSnapshot,
} = storeToRefs(sseStore);

const phaseLabel = computed(() => {
  const map: Record<string, string> = {
    idle: '空闲',
    connecting: '连接中',
    connected: '已连接',
    'demo-pause': '演示断连',
    reconnecting: '重连中',
  };
  return map[phase.value] ?? phase.value;
});

const durationText = computed(() => {
  const s = connectionDuration.value;
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
});

function shortId(id?: string | null) {
  return id ? id.slice(-8) : '无';
}

function formatJournal(entry: SseJournalEntry) {
  const t = new Date(entry.at).toLocaleTimeString();
  switch (entry.kind) {
    case 'connect-start':
      return `[${t}] 开始建连 #${entry.attempt} · Last-Event-ID=${shortId(entry.lastEventId)}`;
    case 'connect':
      return `[${t}] 建连成功 stream#${entry.streamNo} (${entry.source}) · 携带游标 ${shortId(entry.lastEventId)}`;
    case 'disconnect':
      return `[${t}] 断开 · ${entry.reason}${entry.detail ? ' · ' + entry.detail : ''}`;
    case 'reconnect-scheduled':
      return `[${t}] ${entry.delayMs}ms 后进行第 ${entry.attempt} 次重连`;
    case 'reconnect-failed':
      return `[${t}] 重连失败 #${entry.attempt}${entry.status ? ' HTTP' + entry.status : ''}: ${entry.message}`;
    case 'event':
      return `[${t}] ${entry.source === 'catch-up' ? '补推' : '实时'} id=${shortId(entry.messageId)} · ${entry.title}${entry.deduped ? ' [去重跳过]' : ''} · ${entry.isRead ? '已读' : '未读'}`;
    case 'dedup-skip':
      return `[${t}] 幂等去重跳过 id=${shortId(entry.messageId)}`;
    case 'heartbeat':
      return `[${t}] ♥ 心跳帧`;
    case 'debug':
      return `[${t}] ${entry.message}`;
    default:
      return '';
  }
}

function journalClass(entry: SseJournalEntry) {
  if (entry.kind === 'disconnect') return 'log-disconnect';
  if (entry.kind === 'reconnect-scheduled') return 'log-reconnect';
  if (entry.kind === 'reconnect-failed') return 'log-disconnect';
  if (entry.kind === 'connect' || entry.kind === 'connect-start') return 'log-connect';
  if (entry.kind === 'event') return entry.source === 'catch-up' ? 'log-catchup' : 'log-live';
  if (entry.kind === 'dedup-skip') return 'log-dedup';
  if (entry.kind === 'heartbeat') return 'log-heartbeat';
  return 'log-debug';
}
</script>

<template>
  <div class="sse-debug">
    <div class="debug-grid">
      <div class="debug-item"><span>阶段</span><strong>{{ phaseLabel }}</strong></div>
      <div class="debug-item"><span>连接</span><strong :class="isConnected ? 'ok' : 'off'">{{ isConnected ? '已连接' : '未连接' }}</strong></div>
      <div class="debug-item"><span>持续</span><strong>{{ durationText }}</strong></div>
      <div class="debug-item"><span>建连次数</span><strong>{{ streamCount }}</strong></div>
      <div class="debug-item"><span>重连尝试</span><strong>{{ reconnectAttempt }}</strong></div>
      <div class="debug-item"><span>退避延迟</span><strong>{{ lastRetryDelay }}ms</strong></div>
      <div class="debug-item"><span>Last-Event-ID</span><code :title="debugSnapshot.lastEventId ?? ''">{{ shortId(debugSnapshot.lastEventId) }}</code></div>
      <div class="debug-item"><span>Pinia 游标</span><code :title="messagesStore.lastStreamId">{{ shortId(messagesStore.lastStreamId) }}</code></div>
      <div class="debug-item"><span>去重 Set</span><strong>{{ debugSnapshot.seenIds }}</strong></div>
      <div class="debug-item"><span>补推/实时/去重</span><strong>{{ catchUpCount }}/{{ liveCount }}/{{ dedupSkipCount }}</strong></div>
      <div class="debug-item"><span>未读计数</span><strong class="unread">{{ messagesStore.unreadCount }}</strong></div>
      <div class="debug-item"><span>用户</span><strong>{{ authStore.profile?.username ?? '?' }}</strong></div>
    </div>

    <div class="actions">
      <button
        type="button"
        class="demo-btn"
        :disabled="demoPauseRemaining > 0 || isSyncing || phase === 'connecting'"
        @click="sseStore.disconnectForDemo(15)"
      >
        {{
          demoPauseRemaining > 0
            ? `模拟断连中 ${demoPauseRemaining}s…`
            : '模拟断连 15s'
        }}
      </button>
      <button type="button" class="ghost-btn" :disabled="!isConnected" @click="sseStore.disconnect()">
        手动断开
      </button>
      <button type="button" class="ghost-btn" :disabled="isConnected || demoPauseRemaining > 0" @click="sseStore.openStream()">
        手动重连
      </button>
      <button type="button" class="ghost-btn" @click="sseStore.clearJournal()">清空日志</button>
    </div>

    <div class="journal-wrap">
      <div class="journal-head">SSE 事件日志（最近 {{ journal.length }} 条）</div>
      <ul v-if="journal.length" class="journal-list">
        <li v-for="(entry, i) in journal" :key="i" :class="journalClass(entry)">
          {{ formatJournal(entry) }}
        </li>
      </ul>
      <p v-else class="journal-empty">重启后端、模拟断连或收消息后，这里会显示详细日志</p>
    </div>
  </div>
</template>

<style scoped>
.sse-debug {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed #e2e8f0;
}
.debug-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.35rem 0.75rem;
  margin-bottom: 0.65rem;
  font-size: 0.75rem;
}
.debug-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.debug-item span {
  color: #94a3b8;
  font-size: 0.68rem;
}
.debug-item strong.ok { color: #16a34a; }
.debug-item strong.off { color: #dc2626; }
.debug-item strong.unread { color: #dc2626; }
.debug-item code {
  font-family: ui-monospace, monospace;
  font-size: 0.68rem;
  background: #f1f5f9;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.65rem;
}
.demo-btn {
  padding: 0.25rem 0.65rem;
  font-size: 0.75rem;
  border: 1px solid #fca5a5;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
.demo-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ghost-btn {
  padding: 0.25rem 0.65rem;
  font-size: 0.75rem;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  border-radius: 6px;
  cursor: pointer;
}
.ghost-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.journal-head {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.35rem;
}
.journal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
}
.journal-list li {
  padding: 0.2rem 0.35rem;
  border-radius: 4px;
  margin-bottom: 2px;
  word-break: break-all;
}
.journal-empty {
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
}
.log-disconnect { background: #fef2f2; color: #b91c1c; }
.log-reconnect { background: #fffbeb; color: #b45309; }
.log-connect { background: #eef2ff; color: #4338ca; }
.log-catchup { background: #ecfdf5; color: #047857; }
.log-live { background: #f0f9ff; color: #0369a1; }
.log-dedup { background: #faf5ff; color: #7e22ce; }
.log-heartbeat { background: #f8fafc; color: #94a3b8; }
.log-debug { background: #f1f5f9; color: #64748b; }
</style>
