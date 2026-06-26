<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useSseStore } from '@/stores/sse';
import { useMessagesStore } from '@/stores/messages';

const sseStore = useSseStore();
const messagesStore = useMessagesStore();
const { catchUpCount, liveCount, dedupSkipCount, streamCount, reconnectAttempt } = storeToRefs(sseStore);
</script>

<template>
  <div class="send-flow card">
    <h3>SSE 发送流程可视化</h3>

    <div class="flow-diagram">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-body">
          <strong>POST /send</strong>
          <p>MessageInfo 落库 + N 条 userMessageStates</p>
        </div>
      </div>
      <div class="arrow">▼</div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-body">
          <strong>Change Stream → handleNewMessage</strong>
          <p>join 本体 → messageCenter$.next(envelope)</p>
        </div>
      </div>
      <div class="arrow">▼</div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-body">
          <strong>getStreamingChannel</strong>
          <p>filter(targetUserId) → SSE write(id + data)</p>
        </div>
      </div>
      <div class="arrow">▼</div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-body">
          <strong>Client onmessage</strong>
          <p>JSON.parse → _seenIds 去重 → addMessage → unreadCount ±1</p>
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <span class="stat-label">连接</span>
        <span class="stat-val" :class="sseStore.isConnected ? 'ok' : 'off'">
          {{ sseStore.isConnected ? '已连接' : '未连接' }}
        </span>
      </div>
      <div class="stat">
        <span class="stat-label">建连</span>
        <span class="stat-val">{{ streamCount }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">重连尝试</span>
        <span class="stat-val">{{ reconnectAttempt }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">补推/实时</span>
        <span class="stat-val">{{ catchUpCount }}/{{ liveCount }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">去重跳过</span>
        <span class="stat-val dedup">{{ dedupSkipCount }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">未读</span>
        <span class="stat-val unread">{{ messagesStore.unreadCount }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.send-flow h3 { margin: 0 0 0.75rem; }
.flow-diagram { margin-bottom: 0.75rem; }
.step {
  display: flex;
  gap: 0.5rem;
  padding: 0.35rem 0;
  align-items: flex-start;
}
.step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.step-body strong { font-size: 0.8rem; }
.step-body p { margin: 0; font-size: 0.7rem; color: #64748b; }
.arrow {
  text-align: center;
  color: #94a3b8;
  font-size: 0.7rem;
  padding-left: 2rem;
  line-height: 1;
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  padding: 0.5rem 0;
  border-top: 1px dashed #e2e8f0;
}
.stat {
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.stat-label { color: #64748b; }
.stat-val { font-weight: 700; }
.stat-val.ok { color: #16a34a; }
.stat-val.off { color: #dc2626; }
.stat-val.unread { color: #dc2626; }
.stat-val.dedup { color: #7e22ce; }
</style>
