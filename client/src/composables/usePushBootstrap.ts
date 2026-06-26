import { ref } from 'vue';
import { syncFromDb, syncFullFromDb, refreshUnreadCount } from './useMessageSync';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';
import { useOutboxStore } from '@/stores/outbox';
import { useSseStore } from '@/stores/sse';

const isSyncing = ref(false);
const syncCount = ref(0);
/** 本会话是否已做过 DB 全量/增量同步，避免切页或重连时重复 get-all 导致整页闪动 */
let dbSyncedForSession = false;
let tabVisibleHandler: (() => void) | null = null;

function bindTabUnreadRefresh() {
  if (tabVisibleHandler || typeof document === 'undefined') return;
  tabVisibleHandler = () => {
    if (!document.hidden && useMessagesStore().pushMode === 'sse') {
      void refreshUnreadCount();
    }
  };
  document.addEventListener('visibilitychange', tabVisibleHandler);
}

function unbindTabUnreadRefresh() {
  if (tabVisibleHandler) {
    document.removeEventListener('visibilitychange', tabVisibleHandler);
    tabVisibleHandler = null;
  }
}

/** 鉴权后：同步历史 → unread-count 初始化 → SSE 建连 */
export async function bootstrapPushSession(options?: { forceSync?: boolean }) {
  const auth = useAuthStore();
  const messagesStore = useMessagesStore();
  const sseStore = useSseStore();
  const userId = auth.profile?.id;

  if (userId) {
    messagesStore.loadLastStreamId(userId);
  }

  const needSync = options?.forceSync || !dbSyncedForSession;
  if (needSync) {
    isSyncing.value = true;
    try {
      if (messagesStore.lastStreamId) {
        await syncFromDb({ initUnread: true });
      } else {
        await syncFullFromDb();
      }
      dbSyncedForSession = true;
      syncCount.value += 1;
    } finally {
      isSyncing.value = false;
    }
  }

  bindTabUnreadRefresh();
  if (needSync) {
    useSseStore().pushJournal({ at: Date.now(), kind: 'debug', message: 'DB 同步完成，开始建立 SSE' });
  }
  if (!sseStore.isConnected) {
    await sseStore.openStream();
  }
  void useOutboxStore().flush();
}

/** 切换到短轮询：加载游标，首屏由 poll 增量接口完成 */
export async function bootstrapPollingSession() {
  const auth = useAuthStore();
  const messagesStore = useMessagesStore();
  const userId = auth.profile?.id;

  if (userId) {
    messagesStore.loadLastStreamId(userId);
  }

  bindTabUnreadRefresh();
  void useOutboxStore().flush();
}

export function resetPushSession() {
  unbindTabUnreadRefresh();
  useSseStore().reset();
  useMessagesStore().reset();
  dbSyncedForSession = false;
  syncCount.value = 0;
  isSyncing.value = false;
  void import('./usePollCore').then(({ resetPollState }) => resetPollState());
}

export function usePushBootstrap() {
  return { isSyncing, syncCount };
}
