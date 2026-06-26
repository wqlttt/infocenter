import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSessionExpiredStore = defineStore('sessionExpired', () => {
  const visible = ref(false);

  function notify() {
    if (visible.value) return;
    visible.value = true;
  }

  function reset() {
    visible.value = false;
  }

  return { visible, notify, reset };
});
