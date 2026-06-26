import { api } from '@/utils/api';
import type { CreateMessagePayload, MessagePayload, PollResponse, SyncResponse } from '@/types';

const BASE = '/label-platform-admin/message';

export function pollMessages(data?: { lastEventId?: string; limit?: number }) {
  return api.get<PollResponse>(`${BASE}/poll`, { params: data }).then((r) => r.data);
}

export function getAllMessages(data?: { page?: number; pageSize?: number }) {
  return api.get<SyncResponse>(`${BASE}/get-all`, { params: data }).then((r) => r.data);
}

export function getMessageDetail(data: { messageId: string }) {
  return api.get<MessagePayload | null>(`${BASE}/get-detail`, { params: data }).then((r) => r.data);
}

export function getUnreadCount() {
  return api.get<{ count: number }>(`${BASE}/unread-count`).then((r) => r.data);
}

export function applySubmit(data: Record<string, unknown>) {
  return api.post<{ applied: boolean }>(`${BASE}/apply-submit`, data).then((r) => r.data);
}

export function sendMessage(data: CreateMessagePayload) {
  return api.post<{ messageId: string; delivered: number }>(`${BASE}/send`, data).then((r) => r.data);
}

export function readMessage(data: { messageId: string }) {
  return api.post(`${BASE}/read`, data).then((r) => r.data);
}

export function batchRead(data?: { messageIds?: string[] }) {
  return api.post(`${BASE}/batch-read`, data ?? {}).then((r) => r.data);
}

export function deleteMessage(data: { messageId: string }) {
  return api.post(`${BASE}/delete`, data).then((r) => r.data);
}

export function batchDelete(data: { messageIds: string[] }) {
  return api.post(`${BASE}/batch-delete`, data).then((r) => r.data);
}
