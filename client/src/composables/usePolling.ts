import { onUnmounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';
import {
  POLL_INTERVAL_MS,
  setPollListener,
  startPollingLoop,
  stopPollingLoop,
} from './usePollCore';

export function usePolling() {
  const pollCount = ref(0);
  const nextPollIn = ref(POLL_INTERVAL_MS / 1000);
  const hasMore = ref(false);
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function startCountdown() {
    clearCountdown();
    nextPollIn.value = POLL_INTERVAL_MS / 1000;
    countdownTimer = setInterval(() => {
      nextPollIn.value = Math.max(0, nextPollIn.value - 1);
      if (nextPollIn.value <= 0) {
        nextPollIn.value = POLL_INTERVAL_MS / 1000;
      }
    }, 1000);
  }

  function start() {
    stop();
    const auth = useAuthStore();
    const messagesStore = useMessagesStore();
    if (auth.profile?.id) {
      messagesStore.loadLastStreamId(auth.profile.id);
    }

    setPollListener((meta) => {
      pollCount.value += 1;
      hasMore.value = meta.hasMore;
      nextPollIn.value = POLL_INTERVAL_MS / 1000;
    });

    startPollingLoop();
    startCountdown();
  }

  function stop() {
    stopPollingLoop();
    setPollListener(null);
    clearCountdown();
  }

  onUnmounted(stop);

  return { pollCount, nextPollIn, hasMore, start, stop };
}

export { resetPollState, isPollingActive } from './usePollCore';
