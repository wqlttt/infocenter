import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, setTokens, clearTokens } from '@/utils/api';
import type { UserProfile } from '@/types';
import { findDemoAccount } from '@/config/demo-accounts';

export const useAuthStore = defineStore('auth', () => {
  const profile = ref<UserProfile | null>(null);
  const loading = ref(false);

  async function login(username: string, password: string) {
    loading.value = true;
    try {
      const { data } = await api.post('/auth/login', { username, password });
      setTokens(data.accessToken, data.refreshToken);
      await fetchProfile();
    } finally {
      loading.value = false;
    }
  }

  async function loginAsDemoUser(username: string) {
    const account = findDemoAccount(username);
    if (!account) throw new Error('Unknown demo user');
    await login(account.username, account.password);
  }

  async function fetchProfile() {
    const { data } = await api.get<UserProfile>('/auth/profile');
    profile.value = data;
    return data;
  }

  async function clearSession() {
    clearTokens();
    profile.value = null;
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    } finally {
      await clearSession();
    }
  }

  async function initFromSession() {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return false;
    try {
      await fetchProfile();
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }

  return {
    profile,
    loading,
    login,
    loginAsDemoUser,
    fetchProfile,
    logout,
    clearSession,
    initFromSession,
  };
});
