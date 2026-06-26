import { onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useMessagesStore } from '@/stores/messages';
import { useSseStore } from '@/stores/sse';
import { usePolling, resetPollState, isPollingActive } from './usePolling';
import { useApiHealth } from './useApiHealth';
import { bootstrapPushSession, bootstrapPollingSession } from './usePushBootstrap';
import { usePushBootstrap } from './usePushBootstrap';
import type { PushMode } from '@/types';

export function usePushConnection() {
  const messagesStore = useMessagesStore();
  const sseStore = useSseStore();
  const { isConnected, phase, streamCount, connectionDuration, demoPauseRemaining } = storeToRefs(sseStore);
  const { isSyncing, syncCount } = usePushBootstrap();
  const { apiOnline } = useApiHealth();
  const mode = ref<PushMode>('sse');
  const polling = usePolling();

  async function applyMode(next: PushMode) {
    if (next === 'sse' && mode.value === 'sse' && sseStore.isConnected) {
      return;
    }
    if (next === 'polling' && mode.value === 'polling' && isPollingActive()) {
      return;
    }

    mode.value = next;
    messagesStore.setPushMode(next);

    if (next === 'sse') {
      polling.stop();
      resetPollState();
      if (!sseStore.isConnected) {
        await bootstrapPushSession();
      }
    } else {
      sseStore.disconnect();
      await bootstrapPollingSession();
      polling.start();
    }
  }

  onMounted(async () => {
    mode.value = messagesStore.pushMode;
    if (mode.value === 'sse') {
      if (!sseStore.isConnected) {
        await bootstrapPushSession();
      }
    } else if (!isPollingActive()) {
      await bootstrapPollingSession();
      polling.start();
    }
  });

  return {
    mode,
    applyMode,
    sse: {
      isConnected,
      isSyncing,
      syncCount,
      phase,
      streamCount,
      connectionDuration,
      demoPauseRemaining,
    },
    polling,
    apiOnline,
  };
}
