import type { AxiosError } from 'axios';

export function formatApiError(e: unknown, fallback = '操作失败'): string {
  const err = e as AxiosError<{ message?: string | string[] }>;
  const msg = err.response?.data?.message;
  if (msg) {
    return Array.isArray(msg) ? msg.join(', ') : String(msg);
  }
  if (err.code === 'ERR_NETWORK' || !err.response) {
    return '无法连接后端，请检查网络';
  }
  return err.message ?? fallback;
}
