<script setup lang="ts">
import NavBar from '@/components/NavBar.vue';
import ModeSwitch from '@/components/ModeSwitch.vue';
import MessagePanel from '@/components/MessagePanel.vue';
import TeamJoinRequestPanel from '@/components/TeamJoinRequestPanel.vue';
import { usePushConnection } from '@/composables/usePushConnection';

const { mode, applyMode, sse, polling, apiOnline } = usePushConnection();
</script>

<template>
  <div class="page">
    <NavBar />
    <h2>消息中心 (成员)</h2>
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
    <TeamJoinRequestPanel />
    <MessagePanel />
  </div>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1rem 2rem;
}
</style>
