<script setup lang="ts">
import { computed, watch } from 'vue';
import type { MessagePayload } from '@/types';
import { categoryMeta, messageCategory, parseMessageLink } from '@/utils/messageLink';
import MessageActionLink from '@/components/MessageActionLink.vue';
import { readMessage } from '@/service/message';
import { useMessagesStore } from '@/stores/messages';

const props = defineProps<{
  open: boolean;
  loading?: boolean;
  message: MessagePayload | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const messagesStore = useMessagesStore();

const cat = computed(() =>
  props.message ? messageCategory(props.message.title, props.message.linkUrl) : 'general',
);
const meta = computed(() => categoryMeta(cat.value));
const hasAction = computed(() => !!parseMessageLink(props.message?.linkUrl));

function formatTime(ts?: string) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

async function markReadIfNeeded() {
  const msg = props.message;
  if (!msg || msg.isRead) return;
  try {
    await readMessage({ messageId: msg.messageId });
    messagesStore.markReadLocally(msg.messageId);
    msg.isRead = true;
  } catch { /* ignore */ }
}

watch(
  () => ({ open: props.open, loading: props.loading, message: props.message }),
  ({ open, loading, message }) => {
    if (open && !loading && message && !message.isRead) {
      void markReadIfNeeded();
    }
  },
);

function onActionNavigate() {
  void markReadIfNeeded();
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="backdrop">
      <div v-if="open" class="backdrop" @click.self="emit('close')">
        <Transition name="card" appear>
          <div v-if="open" class="detail-card" role="dialog" aria-modal="true">
            <button type="button" class="close-fab" aria-label="关闭" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>

            <div v-if="loading" class="skeleton-wrap">
              <div class="sk-hero" />
              <div class="sk-line long" />
              <div class="sk-line" />
              <div class="sk-line short" />
            </div>

            <template v-else-if="message">
              <div class="hero" :style="{ '--accent': meta.accent }">
                <div class="hero-bg">
                  <span class="orb orb-a" />
                  <span class="orb orb-b" />
                </div>

                <div class="hero-top">
                  <div class="icon-ring">
                    <span class="hero-icon">{{ meta.icon }}</span>
                  </div>
                  <div class="badges">
                    <span class="cat-pill">{{ meta.label }}</span>
                    <span class="status-pill" :class="message.isRead ? 'read' : 'unread'">
                      <span class="dot" />
                      {{ message.isRead ? '已读' : '未读' }}
                    </span>
                  </div>
                </div>

                <h2 class="hero-title">{{ message.title }}</h2>

                <div class="hero-meta">
                  <span class="meta-item">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" />
                      <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                    </svg>
                    {{ formatTime(message.sendMessageTime) }}
                  </span>
                  <span class="meta-item type">{{ message.sendMessageType }}</span>
                </div>
              </div>

              <div class="body" :style="{ '--accent': meta.accent }">
                <section class="section">
                  <p class="section-label">消息正文</p>
                  <div class="content-block">
                    <p class="content">{{ message.content }}</p>
                  </div>
                </section>

                <section v-if="message.linkUrl?.trim() && hasAction" class="section action-section">
                  <p class="section-label">快捷操作</p>
                  <MessageActionLink
                    :link-url="message.linkUrl"
                    block
                    @navigate="onActionNavigate"
                  />
                </section>
                <section v-else-if="message.linkUrl?.trim()" class="section action-section">
                  <p class="section-label">链接</p>
                  <p class="link-fallback">{{ message.linkUrl }}</p>
                </section>

                <details v-if="!hasAction" class="debug">
                  <summary>调试信息</summary>
                  <dl>
                    <dt>messageId</dt><dd><code>{{ message.messageId }}</code></dd>
                    <dt>游标 _id</dt><dd><code>{{ message._id }}</code></dd>
                  </dl>
                </details>
                <details v-else class="debug">
                  <summary>调试信息</summary>
                  <dl>
                    <dt>linkUrl</dt><dd><code>{{ message.linkUrl }}</code></dd>
                    <dt>messageId</dt><dd><code>{{ message.messageId }}</code></dd>
                  </dl>
                </details>

                <button type="button" class="dismiss-btn" @click="emit('close')">关闭</button>
              </div>
            </template>

            <div v-else class="empty-state">
              <span class="empty-icon">📭</span>
              <p>消息不存在或无权查看</p>
              <button type="button" class="dismiss-btn" @click="emit('close')">返回</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgb(15 23 42 / 0.45);
  backdrop-filter: blur(10px) saturate(1.2);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.detail-card {
  position: relative;
  width: min(26rem, 100%);
  max-height: min(88vh, 640px);
  overflow: auto;
  background: #fff;
  border-radius: 24px;
  border: 1px solid rgb(255 255 255 / 60%);
  box-shadow:
    0 0 0 1px rgb(15 23 42 / 4%),
    0 24px 48px -12px rgb(15 23 42 / 22%),
    0 48px 96px -24px rgb(15 23 42 / 18%);
}

.close-fab {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 3;
  width: 2.125rem;
  height: 2.125rem;
  border: none;
  border-radius: 999px;
  background: rgb(255 255 255 / 85%);
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgb(15 23 42 / 8%);
  transition: transform 0.15s, background 0.15s, color 0.15s;
}
.close-fab svg {
  width: 1rem;
  height: 1rem;
}
.close-fab:hover {
  transform: scale(1.05);
  background: #fff;
  color: #0f172a;
}

/* Hero */
.hero {
  position: relative;
  padding: 1.75rem 1.5rem 1.35rem;
  overflow: hidden;
  border-radius: 24px 24px 0 0;
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--accent) 22%, white) 0%,
    color-mix(in srgb, var(--accent) 6%, white) 45%,
    #fff 100%
  );
}
.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.55;
}
.orb-a {
  width: 9rem;
  height: 9rem;
  top: -3rem;
  right: -2rem;
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}
.orb-b {
  width: 6rem;
  height: 6rem;
  bottom: -2rem;
  left: -1rem;
  background: color-mix(in srgb, var(--accent) 25%, #e0e7ff);
}

.hero-top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.icon-ring {
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 18px;
  background: rgb(255 255 255 / 72%);
  border: 1px solid rgb(255 255 255 / 90%);
  box-shadow:
    0 4px 16px color-mix(in srgb, var(--accent) 18%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 80%);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}
.hero-icon {
  font-size: 1.65rem;
  line-height: 1;
}
.badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
  padding-top: 0.15rem;
  padding-right: 2.25rem;
}
.cat-pill {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--accent);
  background: rgb(255 255 255 / 70%);
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 15%, transparent);
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 65%);
}
.status-pill .dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
}
.status-pill.unread {
  color: #b45309;
}
.status-pill.unread .dot {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgb(245 158 11 / 25%);
}
.status-pill.read {
  color: #047857;
}
.status-pill.read .dot {
  background: #10b981;
}

.hero-title {
  position: relative;
  margin: 0 0 0.75rem;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.02em;
  color: #0f172a;
  padding-right: 1.5rem;
}

.hero-meta {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}
.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: #64748b;
}
.meta-item svg {
  width: 0.9rem;
  height: 0.9rem;
  opacity: 0.7;
}
.meta-item.type {
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  background: rgb(255 255 255 / 55%);
  color: #475569;
}

/* Body */
.body {
  padding: 0.25rem 1.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}
.section-label {
  margin: 0 0 0.45rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.content-block {
  position: relative;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border-radius: 16px;
  padding: 1.1rem 1.15rem;
  border: 1px solid #eef2f7;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 80%);
}
.content-block::before {
  content: '';
  position: absolute;
  left: 0;
  top: 1rem;
  bottom: 1rem;
  width: 3px;
  border-radius: 0 4px 4px 0;
  background: linear-gradient(180deg, var(--accent, #2563eb), color-mix(in srgb, var(--accent, #2563eb) 35%, white));
}
.action-section {
  padding-top: 0.15rem;
}
.link-fallback {
  margin: 0;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-radius: 12px;
  font-size: 0.8125rem;
  color: #64748b;
  word-break: break-all;
}

.dismiss-btn {
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.65rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  color: #64748b;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.dismiss-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #334155;
}

.debug {
  font-size: 0.72rem;
  color: #94a3b8;
}
.debug summary {
  cursor: pointer;
  user-select: none;
  padding: 0.25rem 0;
}
.debug dl {
  margin: 0.35rem 0 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.65rem;
}
.debug code {
  font-size: 0.65rem;
  word-break: break-all;
  color: #64748b;
}

/* Skeleton */
.skeleton-wrap {
  padding: 1.5rem;
}
.sk-hero {
  height: 7rem;
  border-radius: 16px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  margin-bottom: 1rem;
}
.sk-line {
  height: 0.75rem;
  border-radius: 6px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  margin-bottom: 0.5rem;
}
.sk-line.long { width: 85%; }
.sk-line.short { width: 45%; }

.empty-state {
  padding: 2.5rem 1.5rem;
  text-align: center;
}
.empty-icon {
  font-size: 2.25rem;
  display: block;
  margin-bottom: 0.5rem;
}
.empty-state p {
  margin: 0 0 1rem;
  color: #94a3b8;
  font-size: 0.875rem;
}

.content {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.75;
  color: #334155;
  white-space: pre-wrap;
}

/* Animations */
.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 0.22s ease;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}
.card-enter-active {
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.card-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.card-enter-from,
.card-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(12px);
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
