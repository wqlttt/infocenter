import { defineStore } from 'pinia';
import { ref } from 'vue';
import { sendMessage } from '@/service/message';
import type { CreateMessagePayload } from '@/types';

export interface OutboxItem {
  id: string;
  payload: CreateMessagePayload;
  createdAt: number;
  label: string;
}

let seq = 0;

export const useOutboxStore = defineStore('outbox', () => {
  const pending = ref<OutboxItem[]>([]);
  const lastFlushAt = ref<number | null>(null);

  function enqueue(payload: CreateMessagePayload, label: string) {
    pending.value.push({
      id: `ob_${++seq}_${Date.now()}`,
      payload,
      createdAt: Date.now(),
      label,
    });
  }

  async function flush(): Promise<number> {
    let sent = 0;
    while (pending.value.length > 0) {
      const item = pending.value[0];
      try {
        await sendMessage(item.payload);
        pending.value.shift();
        sent += 1;
      } catch (e: unknown) {
        const err = e as { code?: string; response?: unknown };
        if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || !err.response) {
          break;
        }
        pending.value.shift();
      }
    }
    if (sent > 0) {
      lastFlushAt.value = Date.now();
    }
    return sent;
  }

  function clear() {
    pending.value = [];
  }

  return { pending, lastFlushAt, enqueue, flush, clear };
});
