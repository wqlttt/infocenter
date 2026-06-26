import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useSessionExpiredStore } from '@/stores/sessionExpired';

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || '/api';
}

const baseURL = getApiBaseUrl();

export const api = axios.create({ baseURL });

const AUTH_NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let refreshPromise: Promise<string> | null = null;

function getStoredTokens() {
  return {
    accessToken: sessionStorage.getItem('accessToken'),
    refreshToken: sessionStorage.getItem('refreshToken'),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  sessionStorage.setItem('accessToken', accessToken);
  sessionStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
}

function isAuthPath(url?: string) {
  if (!url) return false;
  return AUTH_NO_REFRESH.some((path) => url.includes(path));
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken } = getStoredTokens();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) {
    throw new Error('No refresh token');
  }
  const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (isAuthPath(original?.url)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        refreshPromise ??= refreshAccessToken();
        const token = await refreshPromise;
        refreshPromise = null;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        refreshPromise = null;
        clearTokens();
        void import('@/composables/useAppCore').then(({ markSessionExpired }) => {
          markSessionExpired();
          useSessionExpiredStore().notify();
        });
      }
    }
    return Promise.reject(error);
  },
);

export function getAccessToken() {
  return getStoredTokens().accessToken;
}
