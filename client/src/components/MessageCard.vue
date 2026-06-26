<script setup lang="ts">
import { computed } from 'vue';
import type { MessageListItem } from '@/types';
import { categoryMeta, messageCategory, parseMessageLink } from '@/utils/messageLink';
import { useMessagesStore } from '@/stores/messages';

const props = defineProps<{
  message: MessageListItem;
  selected?: boolean;
  showLatency?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-select'): void;
  (e: 'open-detail'): void;
  (e: 'delete'): void;
}>();

const messagesStore = useMessagesStore();

const cat = computed(() => messageCategory(props.message.title, props.message.linkUrl));
const meta = computed(() => categoryMeta(cat.value));
const hasAction = computed(() => !!parseMessageLink(props.message.linkUrl));
const latency = computed(() => messagesStore.getLatency(props.message._id));

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return ts;
  }
}
</script>

<template>
  <li
    class="msg-row"
    :class="{ unread: !message.isRead, selected, 'has-action': hasAction }"
    :style="{ '--accent': meta.accent }"
    @click="emit('open-detail')"
  >
    <label class="check-wrap" @click.stop>
      <input type="checkbox" :checked="selected" @change="emit('toggle-select')" />
    </label>

    <span v-if="!message.isRead" class="unread-bar" aria-hidden="true" />

    <div class="main">
      <div class="line1">
        <span class="cat-tag">{{ meta.label }}</span>
        <strong class="title">{{ message.title || '无标题' }}</strong>
        <span v-if="hasAction" class="action-tag">可操作</span>
        <time class="time">{{ formatTime(message.sendMessageTime) }}</time>
      </div>
      <p class="preview">{{ message.content }}</p>
      <div class="line3">
        <span class="status" :class="{ read: message.isRead }">{{ message.isRead ? '已读' : '未读' }}</span>
        <span v-if="showLatency && latency !== undefined" class="latency">{{ latency }}ms</span>
      </div>
    </div>

    <button
      type="button"
      class="del"
      :disabled="!message.isRead"
      :title="message.isRead ? '删除' : '请先标记已读后再删除'"
      @click.stop="emit('delete')"
    >
      ×
    </button>
  </li>
</template>

<style scoped>
.msg-row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  list-style: none;
  transition: background 0.12s;
  position: relative;
}
.msg-row:last-child {
  border-bottom: none;
}
.msg-row:hover {
  background: #f8fafc;
}
.msg-row.unread {
  background: #fffbeb;
}
.msg-row.unread:hover {
  background: #fef3c7;
}
.msg-row.selected {
  background: #eff6ff;
}
.msg-row.has-action.unread .action-tag {
  display: inline-flex;
}
.unread-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #f59e0b;
}
.msg-row.has-action.unread .unread-bar {
  background: #7c3aed;
}
.check-wrap {
  flex-shrink: 0;
  padding-top: 0.2rem;
  cursor: pointer;
}
.check-wrap input {
  cursor: pointer;
}
.main {
  flex: 1;
  min-width: 0;
}
.line1 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.15rem;
}
.cat-tag {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, white);
  padding: 0.08rem 0.4rem;
  border-radius: 4px;
}
.title {
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.action-tag {
  flex-shrink: 0;
  font-size: 0.62rem;
  font-weight: 600;
  color: #7c3aed;
  background: #f3e8ff;
  padding: 0.06rem 0.35rem;
  border-radius: 4px;
}
.time {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: #94a3b8;
  margin-left: auto;
}
.preview {
  margin: 0;
  font-size: 0.8125rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.line3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.2rem;
}
.status {
  font-size: 0.68rem;
  font-weight: 600;
  color: #b45309;
}
.status.read {
  color: #94a3b8;
  font-weight: 500;
}
.latency {
  font-size: 0.65rem;
  color: #16a34a;
  font-weight: 600;
}
.del {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #cbd5e1;
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.1rem 0.25rem;
  border-radius: 4px;
}
.del:hover:not(:disabled) {
  color: #dc2626;
  background: #fee2e2;
}
.del:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
