<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { batchRead, getMessageDetail } from '@/service/message';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';
import MessageDetailModal from '@/components/MessageDetailModal.vue';
import { categoryMeta, messageCategory, parseMessageLink } from '@/utils/messageLink';
import type { MessageListItem, MessagePayload } from '@/types';

const messagesStore = useMessagesStore();
const auth = useAuthStore();
const { unreadCount, unreadMessages } = storeToRefs(messagesStore);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailMsg = ref<MessagePayload | null>(null);

const preview = computed(() => unreadMessages.value.slice(0, 6));
const badgeText = computed(() => {
  const n = unreadCount.value;
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
});

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (!open.value || !root.value) return;
  if (!root.value.contains(e.target as Node)) close();
}

async function openPreview(msg: MessageListItem) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailMsg.value = null;
  close();
  try {
    const data = await getMessageDetail({ messageId: msg.messageId });
    if (data) {
      detailMsg.value = data;
      messagesStore.upsertDetail(data, auth.profile?.id);
    }
  } finally {
    detailLoading.value = false;
  }
}

async function markAllRead() {
  if (unreadCount.value <= 0) return;
  try {
    await batchRead();
    messagesStore.markAllReadLocally();
  } catch { /* ignore */ }
}

function scrollToPanel() {
  close();
  document.getElementById('message-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

function previewMeta(msg: MessageListItem) {
  return categoryMeta(messageCategory(msg.title, msg.linkUrl));
}

onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div ref="root" class="bell-wrap">
    <button
      type="button"
      class="bell-btn"
      :class="{ active: open, ringing: unreadCount > 0 }"
      aria-label="消息通知"
      @click.stop="toggle"
    >
      <svg class="bell-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2a5 5 0 0 0-5 5v2.1c0 .5-.2 1-.6 1.4L4.8 13.2A2 2 0 0 0 6.5 16h11a2 2 0 0 0 1.7-2.8l-1.6-2.7c-.4-.4-.6-.9-.6-1.4V7a5 5 0 0 0-5-5Z"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
        <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span v-if="badgeText" class="badge">{{ badgeText }}</span>
    </button>

    <Transition name="drop">
      <div v-if="open" class="dropdown" @click.stop>
        <div class="drop-head">
          <strong>消息通知</strong>
          <span v-if="unreadCount" class="count">{{ unreadCount }} 未读</span>
        </div>

        <ul v-if="preview.length" class="preview-list">
          <li
            v-for="msg in preview"
            :key="msg._id"
            class="preview-item"
            :style="{ '--accent': previewMeta(msg).accent }"
            @click="openPreview(msg)"
          >
            <span class="mini-icon">{{ previewMeta(msg).icon }}</span>
            <div class="mini-body">
              <p class="preview-title">{{ msg.title || msg.content.slice(0, 40) }}</p>
              <p class="preview-meta">
                {{ previewMeta(msg).label }}
                <span v-if="parseMessageLink(msg.linkUrl)" class="action-tag">可操作</span>
                · {{ formatTime(msg.sendMessageTime) }}
              </p>
            </div>
          </li>
        </ul>
        <p v-else class="empty">暂无未读消息</p>

        <div class="drop-actions">
          <button type="button" class="link" :disabled="!unreadCount" @click="markAllRead">
            全部已读
          </button>
          <button type="button" class="link primary" @click="scrollToPanel">
            查看全部
          </button>
        </div>
      </div>
    </Transition>

    <MessageDetailModal
      :open="detailOpen"
      :loading="detailLoading"
      :message="detailMsg"
      @close="detailOpen = false"
    />
  </div>
</template>

<style scoped>
.bell-wrap {
  position: relative;
}
.bell-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #e2e8f0;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.bell-btn:hover,
.bell-btn.active {
  background: #334155;
  color: #fff;
}
.bell-icon {
  width: 1.35rem;
  height: 1.35rem;
}
.bell-btn.ringing .bell-icon {
  animation: ring 2s ease-in-out infinite;
  transform-origin: top center;
}
.badge {
  position: absolute;
  top: 0.1rem;
  right: 0.1rem;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.1rem;
  text-align: center;
  box-shadow: 0 0 0 2px #1e293b;
}
.dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  width: min(22rem, 90vw);
  padding: 0;
  overflow: hidden;
  z-index: 50;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  border: 1px solid #e2e8f0;
}
.drop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.875rem;
}
.count {
  color: #dc2626;
  font-size: 0.75rem;
  font-weight: 600;
}
.preview-list {
  list-style: none;
  margin: 0;
  padding: 0.35rem;
  max-height: 18rem;
  overflow-y: auto;
}
.preview-item {
  display: flex;
  gap: 0.6rem;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s;
}
.preview-item:hover {
  background: #f8fafc;
}
.mini-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 12%, white);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  flex-shrink: 0;
}
.mini-body {
  min-width: 0;
  flex: 1;
}
.preview-title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-meta {
  margin: 0.15rem 0 0;
  font-size: 0.68rem;
  color: #94a3b8;
}
.action-tag {
  color: #7c3aed;
  font-weight: 600;
}
.empty {
  margin: 0;
  padding: 1.25rem 1rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.8125rem;
}
.drop-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 0.65rem 1rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.link {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}
.link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.link.primary {
  color: #2563eb;
  font-weight: 600;
}
.link:not(:disabled):hover {
  background: #e2e8f0;
}
.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@keyframes ring {
  0%, 100% { transform: rotate(0); }
  10% { transform: rotate(12deg); }
  20% { transform: rotate(-10deg); }
  30% { transform: rotate(8deg); }
  40% { transform: rotate(-6deg); }
  50% { transform: rotate(0); }
}
</style>
