import { fetchEventSource } from '@microsoft/fetch-event-source';
import { getAccessToken, getApiBaseUrl } from '@/utils/api';
import { refreshUnreadCount } from '@/composables/useMessageSync';
import { useMessagesStore } from '@/stores/messages';
import { useAuthStore } from '@/stores/auth';
import { useSessionExpiredStore } from '@/stores/sessionExpired';
import type { MessagePayload } from '@/types';
import type { SseConnectContext, SseJournalEntry } from '@/types/sse-debug';

const baseURL = getApiBaseUrl();
const CATCH_UP_WINDOW_MS = 3000;

let _sseCtrl: AbortController | null = null;
let _lastEventId: string | null = null;
let _retryDelay = 5000;
let _reconnectAttempt = 0;
let _seenIds = new Set<string>();
let _demoPauseUntil = 0;
let _ctx: SseConnectContext | null = null;
let _catchUpUntil = 0;
let _sessionExpired = false;

function isAuthHttpStatus(status?: number, message?: string): boolean {
  if (status === 401 || status === 403) return true;
  return /\b(401|403)\b/.test(message ?? '');
}

export function isSessionExpired(): boolean {
  return _sessionExpired;
}

export function markSessionExpired(): void {
  _sessionExpired = true;
  disconnectSSE('session-expired');
}

function handleAuthFailure(detail: string) {
  if (_sessionExpired) return;
  markSessionExpired();
  journal({ at: Date.now(), kind: 'disconnect', reason: 'auth', detail });
  useSessionExpiredStore().notify();
}

function journal(entry: SseJournalEntry) {
  _ctx?.onJournal?.(entry);
}

function isReconnectPaused(): boolean {
  if (_ctx?.isReconnectPaused?.()) return true;
  return Date.now() < _demoPauseUntil;
}

function eventSource(): 'catch-up' | 'live' {
  return Date.now() < _catchUpUntil ? 'catch-up' : 'live';
}

/** 建立 SSE 长连接。Promise 在 onopen 成功时 resolve（不等待连接关闭）。 */
export function connectSSE(ctx?: SseConnectContext): Promise<void> {
  if (_sseCtrl) {
    return Promise.resolve();
  }

  if (_sessionExpired) {
    return Promise.resolve();
  }

  if (ctx) _ctx = ctx;

  if (isReconnectPaused()) {
    journal({ at: Date.now(), kind: 'debug', message: '演示断连中，暂停自动重连' });
    return Promise.resolve();
  }

  _sseCtrl = new AbortController();
  _reconnectAttempt += 1;
  const attempt = _reconnectAttempt;
  const connectLastEventId = _lastEventId ?? '';

  ctx?.onPhase?.(attempt > 1 ? 'reconnecting' : 'connecting');
  journal({
    at: Date.now(),
    kind: 'connect-start',
    lastEventId: connectLastEventId,
    attempt,
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    void fetchEventSource(`${baseURL}/label-platform-admin/message/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
        ...(connectLastEventId ? { 'last-event-id': connectLastEventId } : {}),
      },
      body: JSON.stringify({}),
      signal: _sseCtrl!.signal,

      onopen: async (response) => {
        if (!response.ok) {
          const err = new Error(`SSE open failed: ${response.status}`);
          (err as Error & { status?: number }).status = response.status;

          if (isAuthHttpStatus(response.status, err.message)) {
            handleAuthFailure(err.message);
            if (!settled) {
              settled = true;
              _sseCtrl = null;
              ctx?.onPhase?.('idle');
              reject(err);
            }
            throw err;
          }

          journal({
            at: Date.now(),
            kind: 'reconnect-failed',
            attempt,
            status: response.status,
            message: err.message,
          });
          if (!settled) {
            settled = true;
            _sseCtrl = null;
            ctx?.onPhase?.('idle');
            reject(err);
          }
          throw err;
        }

        _retryDelay = 5000;
        _reconnectAttempt = 0;
        _catchUpUntil = Date.now() + CATCH_UP_WINDOW_MS;
        ctx?.setCatchUpUntil?.(_catchUpUntil);

        // 重连后与服务端未读数对齐（补发仅含未读，本地 dedup 也可能跳过已读同步）
        void refreshUnreadCount();

        const streamNo = ctx?.incrementStreamNo?.() ?? 1;
        journal({
          at: Date.now(),
          kind: 'connect',
          streamNo,
          lastEventId: connectLastEventId,
          source: attempt > 1 ? 'retry' : 'initial',
        });

        ctx?.onPhase?.('connected');
        ctx?.onOpen?.();

        if (!settled) {
          settled = true;
          resolve();
        }
      },

      onmessage(event) {
        if (!event.data) {
          journal({ at: Date.now(), kind: 'heartbeat' });
          return;
        }

        if (event.id) {
          _lastEventId = event.id;
        }

        try {
          const msg = JSON.parse(event.data) as MessagePayload;
          const msgId = msg?._id;
          let deduped = false;

          if (msgId) {
            if (_seenIds.has(msgId)) {
              deduped = true;
              journal({ at: Date.now(), kind: 'dedup-skip', messageId: msgId });
            } else {
              _seenIds.add(msgId);
              if (_seenIds.size > 500) {
                const half = [..._seenIds].slice(0, 250);
                half.forEach((id) => _seenIds.delete(id));
              }
            }
          }

          const source = eventSource();
          journal({
            at: Date.now(),
            kind: 'event',
            messageId: msgId ?? '?',
            title: msg.title || msg.content?.slice(0, 30) || '',
            source,
            deduped,
            isRead: !!msg.isRead,
          });

          ctx?.onEvent?.(msg, { source, deduped });

          const messageStore = useMessagesStore();
          const auth = useAuthStore();

          // 补发去重时仍同步已读态（跨端已读后 dedup 会跳过 addMessage）
          if (deduped) {
            if (msg.isRead && msg.messageId) {
              messageStore.markReadLocally(msg.messageId);
            }
            return;
          }

          messageStore.addMessage(msg, auth.profile?.id);
        } catch {
          journal({ at: Date.now(), kind: 'debug', message: `非 JSON 帧: ${event.data.slice(0, 40)}` });
        }
      },

      onclose() {
        _sseCtrl = null;
        ctx?.onPhase?.('idle');
        ctx?.onClose?.();
        journal({ at: Date.now(), kind: 'disconnect', reason: 'server-close', detail: '服务端关闭连接' });
      },

      onerror(err: unknown) {
        const e = err as { status?: number; message?: string };
        const msg = e?.message ?? String(err);

        if (isAuthHttpStatus(e?.status, msg)) {
          _sseCtrl = null;
          ctx?.onPhase?.('idle');
          ctx?.onClose?.();
          handleAuthFailure(msg);
          if (!settled) {
            settled = true;
            reject(err);
          }
          throw err;
        }

        if (_sessionExpired) {
          _sseCtrl = null;
          throw err;
        }

        if (!settled) {
          settled = true;
          _sseCtrl = null;
          ctx?.onPhase?.('idle');
          ctx?.onClose?.();
          reject(err);
        } else {
          _sseCtrl = null;
          ctx?.onPhase?.('idle');
          ctx?.onClose?.();
        }

        journal({
          at: Date.now(),
          kind: 'reconnect-failed',
          attempt: _reconnectAttempt + 1,
          status: e?.status,
          message: msg || '网络错误',
        });

        if (isReconnectPaused()) {
          journal({ at: Date.now(), kind: 'debug', message: '演示断连窗口内，跳过重连调度' });
          throw err;
        }

        const delay = _retryDelay;
        _retryDelay = Math.min(_retryDelay * 1.5, 60_000);
        _reconnectAttempt += 1;

        journal({ at: Date.now(), kind: 'reconnect-scheduled', delayMs: delay, attempt: _reconnectAttempt });
        ctx?.onReconnectAttempt?.(_reconnectAttempt, delay);

        setTimeout(() => {
          if (!isReconnectPaused() && !_sessionExpired) {
            void connectSSE(ctx);
          }
        }, delay);

        throw err;
      },
    }).catch((err) => {
      if (!settled) {
        settled = true;
        _sseCtrl = null;
        reject(err);
      }
    });
  });
}

export function disconnectSSE(reason = 'manual'): void {
  if (_sseCtrl) {
    journal({ at: Date.now(), kind: 'disconnect', reason, detail: '客户端主动断开' });
  }
  _sseCtrl?.abort();
  _sseCtrl = null;
}

export function pauseReconnectForDemo(seconds: number): void {
  _demoPauseUntil = Date.now() + seconds * 1000;
  disconnectSSE('demo-pause');
}

export function getDemoPauseRemainingMs(): number {
  return Math.max(0, _demoPauseUntil - Date.now());
}

export function clearDemoPause(): void {
  _demoPauseUntil = 0;
}

export function getLastEventId(): string | null {
  return _lastEventId;
}

export function getRetryDelay(): number {
  return _retryDelay;
}

export function getReconnectAttempt(): number {
  return _reconnectAttempt;
}

export function getSeenIdsCount(): number {
  return _seenIds.size;
}

export function resetSseState(): void {
  disconnectSSE('reset');
  _lastEventId = null;
  _retryDelay = 5000;
  _reconnectAttempt = 0;
  _seenIds.clear();
  _demoPauseUntil = 0;
  _catchUpUntil = 0;
  _sessionExpired = false;
  _ctx = null;
}
