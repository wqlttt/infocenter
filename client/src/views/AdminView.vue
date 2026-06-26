<script setup lang="ts">
import { api } from '@/utils/api';
import NavBar from '@/components/NavBar.vue';
import ModeSwitch from '@/components/ModeSwitch.vue';
import MessagePanel from '@/components/MessagePanel.vue';
import SendFlowPanel from '@/components/SendFlowPanel.vue';
import SendMessagePanel, { type RecipientOption } from '@/components/SendMessagePanel.vue';
import { usePushConnection } from '@/composables/usePushConnection';

const { mode, applyMode, sse, polling, apiOnline } = usePushConnection();

async function loadAllUsers(): Promise<RecipientOption[]> {
  const { data } = await api.get<{ _id: string; username: string; role: string }[]>('/users');
  return data.map((u) => ({ id: u._id, username: u.username, role: u.role }));
}
</script>

<template>
  <div class="page">
    <NavBar />
    <h2>消息中心 (管理员)</h2>
    <ModeSwitch
      :mode="mode"
      :is-connected="sse.isConnected.value"
      :is-syncing="sse.isSyncing.value"
      :sync-count="sse.syncCount.value"
      :poll-count="polling.pollCount.value"
      :next-poll-in="polling.nextPollIn.value"
      :poll-has-more="polling.hasMore.value"
      :api-online="apiOnline"
      @update:mode="applyMode"
    />
    <div class="grid">
      <SendMessagePanel
        panel-title="群发消息"
        outbox-label="群发消息"
        hint="管理员可向全员群发；成员仅能通过入团申请向队长发消息。"
        :load-recipients="loadAllUsers"
      />
      <div class="card">
        <SendFlowPanel />
      </div>
    </div>
    <MessagePanel :show-latency="true" />
  </div>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1rem 2rem;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}
</style>
