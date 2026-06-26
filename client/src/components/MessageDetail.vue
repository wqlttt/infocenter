<script setup lang="ts">
import { computed } from 'vue';
import type { MessageListItem } from '@/types';
import { readMessage } from '@/service/message';
import { useMessagesStore } from '@/stores/messages';

const props = defineProps<{
  message: MessageListItem;
  selected?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-select'): void;
  (e: 'open-detail'): void;
  (e: 'delete'): void;
}>();

const messagesStore = useMessagesStore();
const latency = computed(() => messagesStore.getLatency(props.message._id));

function typeLabel(t: string) {
  const map: Record<string, string> = { '站内信': '站内信', '邮件': '邮件', '短信': '短信' };
  return map[t] ?? t;
}

const isReadText = computed(() => (props.message.isRead ? '已读' : '未读'));

async function markRead() {
  if (props.message.isRead) return;
  try {
    await readMessage({ messageId: props.message.messageId });
    messagesStore.markReadLocally(props.message.messageId);
  } catch { /* ignore */ }
}

function onRowClick() {
  void markRead();
  emit('open-detail');
}
</script>

<template>
  <li class="message-detail" :class="{ unread: !message.isRead }">
    <div class="row">
      <input
        type="checkbox"
        class="checkbox"
        :checked="selected"
        @click.stop
        @change="emit('toggle-select')"
      />
      <div class="body" @click="onRowClick">
        <div class="head">
          <span class="tag">{{ typeLabel(message.sendMessageType) }}</span>
          <span class="is-read" :class="message.isRead ? 'read' : ''">{{ isReadText }}</span>
          <span v-if="latency !== undefined" class="latency">{{ latency }}ms</span>
        </div>
        <strong class="title">{{ message.title || message.content.slice(0, 40) }}</strong>
        <p class="content">{{ message.content }}</p>
        <p v-if="message._id" class="message-id">
          SSE 游标: <code :title="message._id">{{ message._id.slice(-8) }}</code>
        </p>
      </div>
      <button type="button" class="delete-btn" title="删除" @click.stop="emit('delete')">×</button>
    </div>
  </li>
</template>

<style scoped>
.message-detail {
  padding: 0.6rem 0.75rem;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 3px solid #2563eb;
  animation: slideIn 0.25s ease;
  list-style: none;
  transition: background 0.15s;
}
.message-detail.unread {
  border-left-color: #f59e0b;
  background: #fffbeb;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}
.checkbox {
  margin-top: 0.35rem;
  flex-shrink: 0;
}
.body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.body:hover {
  opacity: 0.92;
}
.delete-btn {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #94a3b8;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}
.delete-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.25rem;
}
.tag {
  font-size: 0.7rem;
  background: #e2e8f0;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}
.is-read {
  font-size: 0.7rem;
  font-weight: 600;
  color: #f59e0b;
}
.is-read.read {
  color: #16a34a;
}
.latency {
  font-size: 0.7rem;
  color: #16a34a;
  font-weight: 600;
  margin-left: auto;
}
.title {
  display: block;
  font-size: 0.9rem;
}
.content {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
}
.message-id {
  margin: 0.35rem 0 0;
  font-size: 0.7rem;
  color: #94a3b8;
}
.message-id code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.68rem;
  color: #475569;
  background: #f1f5f9;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
