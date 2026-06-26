import { pollMessages } from '@/service/message';
import { isSessionExpired } from '@/composables/useAppCore';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';

/** 短轮询间隔（文档建议 15~30s） */
export const POLL_INTERVAL_MS = 15_000;

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _inFlight = false;
let _visibilityBound = false;
let _onPolled: ((meta: { hasMore: boolean }) => void) | null = null;

export function setPollListener(fn: ((meta: { hasMore: boolean }) => void) | null) {
  _onPolled = fn;
}

/** 单次增量拉取 */
export async function pollOnce(): Promise<boolean> {
  if (_inFlight || typeof document !== 'undefined' && document.hidden) return false;
  if (isSessionExpired()) return false;

  _inFlight = true;
  try {
    const auth = useAuthStore();
    const messagesStore = useMessagesStore();
    const userId = auth.profile?.id;
    const cursor = messagesStore.lastStreamId || undefined;

    const { list, lastEventId, unreadCount, hasMore } = await pollMessages({
      lastEventId: cursor,
    });

    messagesStore.applyPollResult({ list, lastEventId, unreadCount }, userId);
    _onPolled?.({ hasMore });
    return true;
  } catch {
    return false;
  } finally {
    _inFlight = false;
  }
}

export function startPollingLoop(): void {
  if (_pollTimer || isSessionExpired()) return;
  bindVisibility();
  void pollOnce();
  _pollTimer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
}

export function stopPollingLoop(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

function bindVisibility() {
  if (_visibilityBound || typeof document === 'undefined') return;
  _visibilityBound = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function unbindVisibility() {
  if (!_visibilityBound) return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  _visibilityBound = false;
}

function onVisibilityChange() {
  if (!document.hidden && useMessagesStore().pushMode === 'polling') {
    void pollOnce();
  }
}

export function resetPollState(): void {
  stopPollingLoop();
  unbindVisibility();
  setPollListener(null);
}

export function isPollingActive(): boolean {
  return _pollTimer !== null;
}
