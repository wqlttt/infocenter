import { sendMessage as sendMessageApi } from '@/service/message';
import { useOutboxStore } from '@/stores/outbox';
import type { CreateMessagePayload } from '@/types';

function isNetworkError(e: unknown) {
  const err = e as { code?: string; response?: unknown };
  return err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || !err.response;
}

/** 发送消息（管理员 / 队长）；在线收件人通过 Change Stream 或 fallback → SSE 收到 */
export async function postMessageWithOutbox(
  payload: CreateMessagePayload,
  label: string,
): Promise<'sent' | 'queued'> {
  try {
    await sendMessageApi(payload);
    void label;
    return 'sent';
  } catch (e) {
    if (isNetworkError(e)) {
      useOutboxStore().enqueue(payload, label);
      return 'queued';
    }
    throw e;
  }
}
