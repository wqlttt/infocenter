<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { isExternalUrl, parseMessageLink, type MessageAction } from '@/utils/messageLink';

const props = defineProps<{
  linkUrl?: string;
  block?: boolean;
}>();

const emit = defineEmits<{ (e: 'navigate'): void }>();

const router = useRouter();

const action = computed<MessageAction | null>(() => parseMessageLink(props.linkUrl));

const isTeamJoin = computed(() => action.value?.kind === 'team-join');
const isNewTab = computed(() => {
  if (!action.value || action.value.kind === 'team-join') return false;
  return isExternalUrl(action.value.href);
});

async function go() {
  if (!action.value) return;
  emit('navigate');
  const { href } = action.value;
  if (isExternalUrl(href)) {
    window.open(href, '_blank', 'noopener');
    return;
  }
  await router.push(href);
}
</script>

<template>
  <button
    v-if="action"
    type="button"
    class="action-btn"
    :class="{ 'team-join': isTeamJoin, external: !isTeamJoin, block }"
    @click.stop="go"
  >
    <span v-if="isTeamJoin" class="glow" aria-hidden="true" />
    <span class="icon-wrap" :class="{ 'external-icon': !isTeamJoin }">
      <svg v-if="isTeamJoin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 5h5v5M10 14L19 5M19 10v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="text">
      <strong>{{ action.label }}</strong>
      <small v-if="action.kind === 'team-join'">{{ action.username }} · {{ action.teamName }}</small>
      <small v-else-if="isNewTab" class="hint">将在新标签页打开</small>
      <small v-else class="hint mono">{{ action.href }}</small>
    </span>
    <span class="arrow-wrap" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.action-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 16px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  font: inherit;
  overflow: hidden;
  transition: transform 0.2s cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.2s ease;
}
.action-btn.block {
  width: 100%;
}
.action-btn.team-join {
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 50%, #5b21b6 100%);
  color: #fff;
  box-shadow:
    0 4px 16px rgb(109 40 217 / 35%),
    inset 0 1px 0 rgb(255 255 255 / 20%);
}
.action-btn.team-join:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 28px rgb(109 40 217 / 42%),
    inset 0 1px 0 rgb(255 255 255 / 25%);
}
.action-btn.external {
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
  color: #334155;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgb(15 23 42 / 4%);
}
.action-btn.external:hover {
  border-color: #cbd5e1;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgb(15 23 42 / 6%);
}
.glow {
  position: absolute;
  top: -50%;
  right: -20%;
  width: 8rem;
  height: 8rem;
  border-radius: 50%;
  background: rgb(255 255 255 / 12%);
  pointer-events: none;
}
.icon-wrap {
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 12px;
  background: rgb(255 255 255 / 18%);
  border: 1px solid rgb(255 255 255 / 22%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.icon-wrap svg {
  width: 1.25rem;
  height: 1.25rem;
}
.external-icon {
  background: #eff6ff;
  border-color: #dbeafe;
  color: #2563eb;
}
.text {
  flex: 1;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.text strong {
  font-size: 0.9rem;
  font-weight: 600;
}
.text small {
  font-size: 0.75rem;
  opacity: 0.88;
}
.text small.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.68rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.arrow-wrap {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 15%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}
.action-btn.external .arrow-wrap {
  background: #eff6ff;
  color: #2563eb;
}
.arrow-wrap svg {
  width: 1rem;
  height: 1rem;
}
.action-btn:hover .arrow-wrap {
  transform: translateX(3px);
}
</style>
