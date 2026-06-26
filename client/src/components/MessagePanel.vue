<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import {
  batchDelete,
  batchRead,
  deleteMessage,
  getMessageDetail,
} from '@/service/message';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';
import MessageCard from '@/components/MessageCard.vue';
import MessageDetailModal from '@/components/MessageDetailModal.vue';
import type { MessagePayload } from '@/types';

defineProps<{ showLatency?: boolean }>();

const auth = useAuthStore();
const messagesStore = useMessagesStore();
const { messages, selectedMessageIds, unreadCount } = storeToRefs(messagesStore);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detailMsg = ref<MessagePayload | null>(null);
const actionBusy = ref(false);

const selectedCount = computed(() => selectedMessageIds.value.size);
const selectedHasUnread = computed(() =>
  messages.value.some(
    (m) => selectedMessageIds.value.has(m.messageId) && !m.isRead,
  ),
);
const canBatchDelete = computed(
  () => selectedCount.value > 0 && !selectedHasUnread.value,
);
const allSelected = computed(() =>
  messages.value.length > 0 && selectedCount.value === messages.value.length,
);

function toggleSelectAll() {
  if (allSelected.value) {
    messagesStore.clearSelection();
    return;
  }
  const next = new Set(messages.value.map((m) => m.messageId));
  messagesStore.selectAll([...next]);
}

async function handleBatchRead() {
  if (unreadCount.value <= 0) return;
  actionBusy.value = true;
  try {
    const ids = [...selectedMessageIds.value];
    await batchRead(ids.length ? { messageIds: ids } : undefined);
    if (ids.length) {
      for (const id of ids) messagesStore.markReadLocally(id);
    } else {
      messagesStore.markAllReadLocally();
    }
  } finally {
    actionBusy.value = false;
  }
}

async function handleBatchDelete() {
  const ids = [...selectedMessageIds.value];
  if (!ids.length || selectedHasUnread.value) return;
  actionBusy.value = true;
  try {
    await batchDelete({ messageIds: ids });
    messagesStore.removeLocally(ids);
    messagesStore.clearSelection();
  } finally {
    actionBusy.value = false;
  }
}

async function deleteOne(messageId: string) {
  const msg = messages.value.find((m) => m.messageId === messageId);
  if (msg && !msg.isRead) return;
  try {
    await deleteMessage({ messageId });
    messagesStore.removeLocally([messageId]);
    if (detailMsg.value?.messageId === messageId) {
      detailOpen.value = false;
      detailMsg.value = null;
    }
  } catch { /* ignore */ }
}

async function openDetail(messageId: string) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailMsg.value = null;
  try {
    const data = await getMessageDetail({ messageId });
    if (data) {
      detailMsg.value = data;
      messagesStore.upsertDetail(data, auth.profile?.id);
    }
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  detailOpen.value = false;
  detailMsg.value = null;
}
</script>

<template>
  <div id="message-panel" class="message-panel card">
    <div class="panel-head">
      <div class="title-block">
        <h3>消息中心</h3>
        <span v-if="unreadCount" class="unread-pill">{{ unreadCount }} 未读</span>
      </div>
      <div class="toolbar">
        <label class="select-all">
          <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
          全选
        </label>
        <button type="button" :disabled="actionBusy || unreadCount <= 0" @click="handleBatchRead">
          一键已读
        </button>
        <button
          type="button"
          class="danger"
          :disabled="actionBusy || !canBatchDelete"
          :title="selectedHasUnread ? '所选含未读消息，请先标记已读' : '删除所选已读消息'"
          @click="handleBatchDelete"
        >
          删除 ({{ selectedCount }})
        </button>
      </div>
    </div>

    <div v-if="!messages.length" class="empty">暂无消息</div>

    <ul v-else class="list">
      <MessageCard
        v-for="msg in messages"
        :key="msg._id"
        :message="msg"
        :selected="selectedMessageIds.has(msg.messageId)"
        :show-latency="showLatency"
        @toggle-select="messagesStore.toggleSelect(msg.messageId)"
        @open-detail="openDetail(msg.messageId)"
        @delete="deleteOne(msg.messageId)"
      />
    </ul>

    <MessageDetailModal
      :open="detailOpen"
      :loading="detailLoading"
      :message="detailMsg"
      @close="closeDetail"
    />
  </div>
</template>

<style scoped>
.message-panel {
  margin-top: 0.5rem;
}
.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.title-block {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.title-block h3 {
  margin: 0;
  font-size: 1.125rem;
}
.unread-pill {
  font-size: 0.72rem;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.toolbar button {
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  cursor: pointer;
}
.toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.toolbar button.danger {
  border-color: #fecaca;
  color: #b91c1c;
  background: #fef2f2;
}
.select-all {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #64748b;
}
.empty {
  color: #94a3b8;
  font-size: 0.875rem;
  padding: 1.5rem 0;
  text-align: center;
}
.list {
  margin: 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  max-height: 480px;
  overflow-y: auto;
}
</style>
