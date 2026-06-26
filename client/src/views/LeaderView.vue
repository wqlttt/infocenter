<script setup lang="ts">
import NavBar from '@/components/NavBar.vue';
import ModeSwitch from '@/components/ModeSwitch.vue';
import MessagePanel from '@/components/MessagePanel.vue';
import SendMessagePanel, { type RecipientOption } from '@/components/SendMessagePanel.vue';
import { usePushConnection } from '@/composables/usePushConnection';
import { useAuthStore } from '@/stores/auth';
import { getTeamMembers } from '@/service/teams';

const auth = useAuthStore();
const { mode, applyMode, sse, polling, apiOnline } = usePushConnection();

async function loadTeamMembers(): Promise<RecipientOption[]> {
  const teamId = auth.profile?.teamId;
  if (!teamId) return [];
  const data = await getTeamMembers(teamId);
  return data.members.map((m) => ({
    id: m.id,
    username: m.username,
    role: 'member',
  }));
}
</script>

<template>
  <div class="page">
    <NavBar />
    <h2>消息中心 (队长)</h2>
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
    <SendMessagePanel
      class="send-block"
      panel-title="队内消息"
      outbox-label="队内消息"
      hint="队长可向已入队成员发送站内信；审批入团申请后，成员会出现在收件人列表中。"
      :load-recipients="loadTeamMembers"
    />
    <MessagePanel />
  </div>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1rem 2rem;
}
.send-block {
  margin-bottom: 1rem;
}
</style>
