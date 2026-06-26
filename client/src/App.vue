<template>
  <router-view />
  <SessionExpiredModal />
</template>

<script setup lang="ts">
import SessionExpiredModal from '@/components/SessionExpiredModal.vue';
</script>
