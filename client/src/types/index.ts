export type UserRole = 'admin' | 'leader' | 'member';

export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  teamId: string | null;
}

export interface Team {
  _id: string;
  name: string;
  leaderId: string;
  memberIds: string[];
}

/** SSE 下发的统一 payload：本体 + 当前用户状态 */
export interface MessagePayload {
  _id: string;
  messageId: string;
  isRead: boolean;
  title: string;
  content: string;
  linkUrl: string;
  sendUserId: string;
  sendMessageType: string;
  sendMessageTime: string;
}

export type MessageListItem = MessagePayload;

export interface SyncResponse {
  list: MessagePayload[];
  total: number;
  page: number;
  pageSize: number;
}

export type PushMode = 'sse' | 'polling';

export interface PollResponse {
  list: MessagePayload[];
  lastEventId?: string;
  unreadCount: number;
  hasMore: boolean;
}

export interface CreateMessagePayload {
  title: string;
  content: string;
  linkUrl?: string;
  sendMessageType: string;
  receiverIds: string[];
}
