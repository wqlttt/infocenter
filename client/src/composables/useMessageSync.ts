import { getAllMessages, getUnreadCount } from '@/service/message';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';
import type { SyncResponse } from '@/types';

export async function refreshUnreadCount() {
  const { count } = await getUnreadCount();
  useMessagesStore().initUnreadCount(count);
  return count;
}

export async function syncFullFromDb(): Promise<SyncResponse> {
  const messagesStore = useMessagesStore();
  messagesStore.lastStreamId = '';
  messagesStore.lastSyncedAt = '';
  return syncFromDb({ initUnread: true });
}

export async function syncFromDb(options?: { initUnread?: boolean }): Promise<SyncResponse> {
  const auth = useAuthStore();
  const messagesStore = useMessagesStore();

  const data = await getAllMessages({ page: 1, pageSize: 200 });
  messagesStore.mergeMessages(data.list, auth.profile?.id);

  if (options?.initUnread !== false) {
    await refreshUnreadCount();
  }

  return data;
}
