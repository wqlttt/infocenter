import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  clearDemoPause,
  connectSSE,
  disconnectSSE,
  getDemoPauseRemainingMs,
  getLastEventId,
  getReconnectAttempt,
  getRetryDelay,
  getSeenIdsCount,
  pauseReconnectForDemo,
  resetSseState,
} from '@/composables/useAppCore';
import type { SseJournalEntry, SsePhase } from '@/types/sse-debug';

const MAX_JOURNAL = 80;

export const useSseStore = defineStore('sse', () => {
  const isConnected = ref(false);
  const phase = ref<SsePhase>('idle');
  const streamCount = ref(0);
  const connectionDuration = ref(0);
  const catchUpCount = ref(0);
  const liveCount = ref(0);
  const dedupSkipCount = ref(0);
  const journal = ref<SseJournalEntry[]>([]);
  const demoPauseRemaining = ref(0);
  const lastRetryDelay = ref(5000);
  const reconnectAttempt = ref(0);

  let durationTimer: ReturnType<typeof setInterval> | null = null;
  let demoPauseTimer: ReturnType<typeof setTimeout> | null = null;
  let demoCountdownTimer: ReturnType<typeof setInterval> | null = null;
  let connectedAt = 0;
  let catchUpUntil = 0;

  function pushJournal(entry: SseJournalEntry) {
    journal.value.unshift(entry);
    if (journal.value.length > MAX_JOURNAL) {
      journal.value.length = MAX_JOURNAL;
    }
  }

  function clearDurationTimer() {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
  }

  function clearDemoTimers() {
    if (demoPauseTimer) {
      clearTimeout(demoPauseTimer);
      demoPauseTimer = null;
    }
    if (demoCountdownTimer) {
      clearInterval(demoCountdownTimer);
      demoCountdownTimer = null;
    }
  }

  function buildContext() {
    return {
      onOpen: () => {
        isConnected.value = true;
        connectedAt = Date.now();
        clearDurationTimer();
        durationTimer = setInterval(() => {
          connectionDuration.value = Math.floor((Date.now() - connectedAt) / 1000);
        }, 1000);
      },
      onClose: () => {
        isConnected.value = false;
        clearDurationTimer();
      },
      onPhase: (p: SsePhase) => {
        phase.value = p;
      },
      onJournal: pushJournal,
      onEvent: (_msg: unknown, meta: { source: 'catch-up' | 'live'; deduped: boolean }) => {
        if (meta.deduped) {
          dedupSkipCount.value += 1;
          return;
        }
        if (meta.source === 'catch-up') catchUpCount.value += 1;
        else liveCount.value += 1;
      },
      setCatchUpUntil: (ts: number) => {
        catchUpUntil = ts;
      },
      getCatchUpUntil: () => catchUpUntil,
      isReconnectPaused: () => demoPauseRemaining.value > 0,
      onReconnectAttempt: (attempt: number, delayMs: number) => {
        reconnectAttempt.value = attempt;
        lastRetryDelay.value = delayMs;
      },
      incrementStreamNo: () => {
        streamCount.value += 1;
        return streamCount.value;
      },
    };
  }

  async function openStream() {
    phase.value = 'connecting';
    await connectSSE(buildContext());
  }

  function disconnect() {
    disconnectSSE('manual');
    isConnected.value = false;
    phase.value = 'idle';
    clearDurationTimer();
  }

  function disconnectForDemo(seconds = 15) {
    if (demoPauseRemaining.value > 0) return;

    clearDemoTimers();
    demoPauseRemaining.value = seconds;
    phase.value = 'demo-pause';
    reconnectAttempt.value = 0;

    pushJournal({ at: Date.now(), kind: 'disconnect', reason: 'demo-pause', detail: `模拟断连 ${seconds}s` });
    pauseReconnectForDemo(seconds);
    isConnected.value = false;
    clearDurationTimer();

    demoCountdownTimer = setInterval(() => {
      const left = Math.ceil(getDemoPauseRemainingMs() / 1000);
      demoPauseRemaining.value = Math.max(0, left);
    }, 500);

    demoPauseTimer = setTimeout(() => {
      clearDemoTimers();
      demoPauseRemaining.value = 0;
      clearDemoPause();
      pushJournal({ at: Date.now(), kind: 'debug', message: '演示断连结束，开始重连' });
      void openStream();
    }, seconds * 1000);
  }

  function reset() {
    clearDemoTimers();
    clearDurationTimer();
    resetSseState();
    isConnected.value = false;
    phase.value = 'idle';
    streamCount.value = 0;
    connectionDuration.value = 0;
    catchUpCount.value = 0;
    liveCount.value = 0;
    dedupSkipCount.value = 0;
    journal.value = [];
    demoPauseRemaining.value = 0;
    reconnectAttempt.value = 0;
    lastRetryDelay.value = 5000;
  }

  function clearJournal() {
    journal.value = [];
    catchUpCount.value = 0;
    liveCount.value = 0;
    dedupSkipCount.value = 0;
  }

  const debugSnapshot = computed(() => ({
    phase: phase.value,
    isConnected: isConnected.value,
    streamCount: streamCount.value,
    connectionDuration: connectionDuration.value,
    lastEventId: getLastEventId(),
    retryDelay: getRetryDelay(),
    reconnectAttempt: getReconnectAttempt(),
    seenIds: getSeenIdsCount(),
    catchUpCount: catchUpCount.value,
    liveCount: liveCount.value,
    dedupSkipCount: dedupSkipCount.value,
  }));

  return {
    isConnected,
    phase,
    streamCount,
    connectionDuration,
    catchUpCount,
    liveCount,
    dedupSkipCount,
    journal,
    demoPauseRemaining,
    lastRetryDelay,
    reconnectAttempt,
    debugSnapshot,
    openStream,
    disconnect,
    disconnectForDemo,
    reset,
    clearJournal,
    pushJournal,
  };
});
