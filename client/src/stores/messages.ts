import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { MessageListItem, MessagePayload, PushMode } from '@/types';
import { isStreamIdAfter, isValidStreamId } from '@/utils/streamId';

export const useMessagesStore = defineStore('messages', () => {
  const messagesMap = ref<Map<string, MessagePayload>>(new Map());
  const lastStreamId = ref('');
  const lastSyncedAt = ref('');
  /** 文档：首屏/tab 切换从 unread-count 初始化，之后靠 SSE ±1 */
  const unreadCount = ref(0);
  const pushMode = ref<PushMode>('sse');
  const latencies = ref<Map<string, number>>(new Map());
  const selectedMessageIds = ref<Set<string>>(new Set());

  const messages = computed((): MessageListItem[] =>
    Array.from(messagesMap.value.values()).sort((a, b) => {
      return new Date(b.sendMessageTime).getTime() - new Date(a.sendMessageTime).getTime();
    }),
  );

  const unreadMessages = computed(() =>
    messages.value.filter((m) => !m.isRead),
  );

  function storageKey(userId: string) {
    return `lastStreamId:${userId}`;
  }

  function syncedAtKey(userId: string) {
    return `lastSyncedAt:${userId}`;
  }

  function loadLastStreamId(userId: string) {
    const stored = sessionStorage.getItem(storageKey(userId));
    lastStreamId.value = stored && isValidStreamId(stored) ? stored : '';
    lastSyncedAt.value = sessionStorage.getItem(syncedAtKey(userId)) ?? '';
  }

  function persistCursor(userId: string) {
    if (lastStreamId.value) sessionStorage.setItem(storageKey(userId), lastStreamId.value);
    if (lastSyncedAt.value) sessionStorage.setItem(syncedAtKey(userId), lastSyncedAt.value);
  }

  function advanceStreamId(id?: string) {
    if (id && isValidStreamId(id) && isStreamIdAfter(id, lastStreamId.value)) {
      lastStreamId.value = id;
    }
  }

  /** 首屏 / tab 切换 / 轮询：从服务端 unread-count 初始化 */
  function initUnreadCount(count: number) {
    unreadCount.value = Math.max(0, count);
  }

  function incrementUnread() {
    unreadCount.value += 1;
  }

  function decrementUnread(n = 1) {
    unreadCount.value = Math.max(0, unreadCount.value - n);
  }

  function mergeMessages(items: MessagePayload[], userId?: string) {
    for (const message of items) {
      messagesMap.value.set(message._id, message);
      advanceStreamId(message._id);
      const ts = message.sendMessageTime;
      if (ts) {
        const latency = Date.now() - new Date(ts).getTime();
        latencies.value.set(message._id, Math.max(0, latency));
      }
    }
    lastSyncedAt.value = new Date().toISOString();
    if (userId) persistCursor(userId);
  }

  /** 短轮询：合并增量列表 + 服务端游标 + 未读数 */
  function applyPollResult(
    result: { list: MessagePayload[]; lastEventId?: string; unreadCount: number },
    userId?: string,
  ) {
    mergeMessages(result.list, userId);
    initUnreadCount(result.unreadCount);
    if (result.lastEventId && isValidStreamId(result.lastEventId) && isStreamIdAfter(result.lastEventId, lastStreamId.value)) {
      lastStreamId.value = result.lastEventId;
      if (userId) persistCursor(userId);
    }
  }

  /** SSE 实时推送：新未读 +1；已读态变更时 -1（含跨端已读） */
  function addMessage(msg: MessagePayload, userId?: string) {
    const prev = messagesMap.value.get(msg._id);
    mergeMessages([msg], userId);
    if (!prev && !msg.isRead) {
      incrementUnread();
    } else if (prev && !prev.isRead && msg.isRead) {
      decrementUnread();
    }
  }

  function findByMessageId(messageId: string) {
    return [...messagesMap.value.values()].find((m) => m.messageId === messageId);
  }

  function markReadLocally(messageId: string) {
    const msg = findByMessageId(messageId);
    if (msg && !msg.isRead) {
      msg.isRead = true;
      decrementUnread();
    }
  }

  function markAllReadLocally() {
    for (const msg of messagesMap.value.values()) {
      msg.isRead = true;
    }
    unreadCount.value = 0;
  }

  function removeLocally(messageIds: string[]) {
    let removedUnread = 0;
    for (const [key, msg] of messagesMap.value.entries()) {
      if (messageIds.includes(msg.messageId)) {
        if (!msg.isRead) removedUnread += 1;
        messagesMap.value.delete(key);
        selectedMessageIds.value.delete(msg.messageId);
      }
    }
    if (removedUnread > 0) decrementUnread(removedUnread);
  }

  function upsertDetail(msg: MessagePayload, userId?: string) {
    mergeMessages([msg], userId);
  }

  function toggleSelect(messageId: string) {
    const next = new Set(selectedMessageIds.value);
    if (next.has(messageId)) next.delete(messageId);
    else next.add(messageId);
    selectedMessageIds.value = next;
  }

  function clearSelection() {
    selectedMessageIds.value = new Set();
  }

  function selectAll(messageIds: string[]) {
    selectedMessageIds.value = new Set(messageIds);
  }

  function getLatency(stateId: string) {
    return latencies.value.get(stateId);
  }

  function setPushMode(mode: PushMode) {
    pushMode.value = mode;
  }

  function reset() {
    messagesMap.value.clear();
    latencies.value.clear();
    selectedMessageIds.value = new Set();
    lastStreamId.value = '';
    lastSyncedAt.value = '';
    unreadCount.value = 0;
  }

  return {
    messagesMap,
    lastStreamId,
    lastSyncedAt,
    unreadCount,
    pushMode,
    selectedMessageIds,
    messages,
    unreadMessages,
    loadLastStreamId,
    initUnreadCount,
    mergeMessages,
    applyPollResult,
    addMessage,
    upsertDetail,
    markReadLocally,
    markAllReadLocally,
    removeLocally,
    toggleSelect,
    clearSelection,
    selectAll,
    getLatency,
    setPushMode,
    reset,
    persistCursor,
    advanceStreamId,
  };
});
