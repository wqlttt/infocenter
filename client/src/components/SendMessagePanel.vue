<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { postMessageWithOutbox } from '@/utils/postMessage';
import { formatApiError } from '@/utils/formatApiError';

export interface RecipientOption {
  id: string;
  username: string;
  role?: string;
}

const props = withDefaults(
  defineProps<{
    hint: string;
    panelTitle?: string;
    outboxLabel?: string;
    loadRecipients: () => Promise<RecipientOption[]>;
  }>(),
  {
    panelTitle: '发送消息',
    outboxLabel: '发送消息',
  },
);

const title = ref('');
const content = ref('');
const linkUrl = ref('');
const selectedIds = ref<string[]>([]);
const recipients = ref<RecipientOption[]>([]);
const loadingRecipients = ref(false);
const sending = ref(false);
const actionError = ref('');
const actionOk = ref('');

onMounted(async () => {
  loadingRecipients.value = true;
  try {
    recipients.value = await props.loadRecipients();
  } catch {
    recipients.value = [];
  } finally {
    loadingRecipients.value = false;
  }
});

function toggleUser(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

function selectAll() {
  if (selectedIds.value.length === recipients.value.length) {
    selectedIds.value = [];
  } else {
    selectedIds.value = recipients.value.map((u) => u.id);
  }
}

async function sendMessage() {
  sending.value = true;
  actionError.value = '';
  actionOk.value = '';
  try {
    if (!selectedIds.value.length) {
      actionError.value = '请至少选择一个收件人';
      return;
    }
    const delivered = selectedIds.value.length;
    const result = await postMessageWithOutbox(
      {
        title: title.value.trim(),
        content: content.value.trim(),
        linkUrl: linkUrl.value.trim(),
        sendMessageType: '站内信',
        receiverIds: selectedIds.value.slice(),
      },
      props.outboxLabel,
    );
    title.value = '';
    content.value = '';
    linkUrl.value = '';
    selectedIds.value = [];
    actionOk.value =
      result === 'queued'
        ? '后端暂不可用，已加入待发队列'
        : `消息已发送给 ${delivered} 个收件人`;
  } catch (e) {
    actionError.value = formatApiError(e, '发送失败');
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="card send-panel">
    <h3>{{ panelTitle }}</h3>
    <p class="send-hint">{{ hint }}</p>
    <input v-model="title" placeholder="消息标题" />
    <textarea v-model="content" placeholder="消息内容" rows="3" />
    <input v-model="linkUrl" placeholder="跳转链接（可选）" />

    <div class="user-select">
      <div class="user-select-head">
        <span>收件人（已选 {{ selectedIds.length }} 人）</span>
        <button
          v-if="recipients.length"
          type="button"
          class="select-all-btn"
          @click="selectAll"
        >
          {{ selectedIds.length === recipients.length ? '取消全选' : '全选' }}
        </button>
      </div>
      <div class="user-list">
        <label
          v-for="u in recipients"
          :key="u.id"
          class="user-item"
          :class="{ checked: selectedIds.includes(u.id) }"
        >
          <input
            type="checkbox"
            :checked="selectedIds.includes(u.id)"
            @change="toggleUser(u.id)"
          />
          <span class="username">{{ u.username }}</span>
          <span v-if="u.role" class="role-tag">{{ u.role }}</span>
        </label>
        <p v-if="loadingRecipients" class="empty">加载收件人…</p>
        <p v-else-if="!recipients.length" class="empty">暂无可选收件人</p>
      </div>
    </div>

    <button type="button" :disabled="sending || !recipients.length" @click="sendMessage">
      {{ sending ? '发送中…' : '发送消息' }}
    </button>
    <p v-if="actionError" class="action-error">{{ actionError }}</p>
    <p v-if="actionOk" class="action-ok">{{ actionOk }}</p>
  </div>
</template>

<style scoped>
.send-panel h3 {
  margin: 0 0 0.35rem;
}
.send-hint {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.5;
}
input,
textarea {
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-sizing: border-box;
}
button {
  padding: 0.4rem 0.75rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.select-all-btn {
  font-size: 0.75rem;
  background: #e2e8f0;
  color: #334155;
  padding: 0.15rem 0.5rem;
}
.user-select {
  margin-bottom: 0.5rem;
}
.user-select-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.35rem;
}
.user-list {
  max-height: 140px;
  overflow-y: auto;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.25rem;
}
.user-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.35rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8125rem;
  transition: background 0.1s;
}
.user-item:hover {
  background: #f1f5f9;
}
.user-item.checked {
  background: #eef2ff;
}
.user-item input {
  width: auto;
  margin: 0;
}
.username {
  font-weight: 500;
}
.role-tag {
  font-size: 0.65rem;
  background: #e2e8f0;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  color: #64748b;
  margin-left: auto;
}
.empty {
  margin: 0;
  padding: 0.25rem 0.35rem;
  font-size: 0.75rem;
  color: #94a3b8;
}
.action-error {
  margin: 0.5rem 0 0;
  color: #dc2626;
  font-size: 0.8125rem;
}
.action-ok {
  margin: 0.5rem 0 0;
  color: #16a34a;
  font-size: 0.8125rem;
}
</style>
