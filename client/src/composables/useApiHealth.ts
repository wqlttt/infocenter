import { onMounted, onUnmounted, ref } from 'vue';
import axios from 'axios';
import { getApiBaseUrl } from '@/utils/api';
import { useOutboxStore } from '@/stores/outbox';

const HEALTH_INTERVAL = 2000;

export function useApiHealth() {
  const apiOnline = ref(true);
  const outbox = useOutboxStore();
  let timer: ReturnType<typeof setInterval> | null = null;
  let checking = false;

  async function checkHealth() {
    if (checking) return;
    checking = true;
    const wasOnline = apiOnline.value;
    try {
      const { data } = await axios.get(`${getApiBaseUrl()}/health`, { timeout: 5000 });
      apiOnline.value = data?.status === 'ok';
    } catch {
      apiOnline.value = false;
    } finally {
      checking = false;
    }
    if (apiOnline.value && (!wasOnline || outbox.pending.length > 0)) {
      await outbox.flush();
    }
  }

  onMounted(() => {
    checkHealth();
    timer = setInterval(checkHealth, HEALTH_INTERVAL);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { apiOnline, checkHealth };
}
