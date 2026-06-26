import type { MessagePayload } from './index';

export type SsePhase = 'idle' | 'connecting' | 'connected' | 'demo-pause' | 'reconnecting';

export type SseJournalEntry =
  | { at: number; kind: 'connect-start'; lastEventId: string; attempt: number }
  | { at: number; kind: 'connect'; streamNo: number; lastEventId: string; source: 'initial' | 'retry' }
  | { at: number; kind: 'disconnect'; reason: string; detail?: string }
  | { at: number; kind: 'reconnect-scheduled'; delayMs: number; attempt: number }
  | { at: number; kind: 'reconnect-failed'; attempt: number; status?: number; message: string }
  | { at: number; kind: 'event'; messageId: string; title: string; source: 'catch-up' | 'live'; deduped: boolean; isRead: boolean }
  | { at: number; kind: 'dedup-skip'; messageId: string }
  | { at: number; kind: 'heartbeat' }
  | { at: number; kind: 'debug'; message: string };

export type SseConnectContext = {
  onOpen?: () => void;
  onClose?: () => void;
  onPhase?: (phase: SsePhase) => void;
  onJournal?: (entry: SseJournalEntry) => void;
  onEvent?: (msg: MessagePayload, meta: { source: 'catch-up' | 'live'; deduped: boolean }) => void;
  getCatchUpUntil?: () => number;
  setCatchUpUntil?: (ts: number) => void;
  isReconnectPaused?: () => boolean;
  onReconnectAttempt?: (attempt: number, delayMs: number) => void;
  getStreamNo?: () => number;
  incrementStreamNo?: () => number;
};
