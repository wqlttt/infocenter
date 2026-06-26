<script setup lang="ts">
import { ref } from 'vue';
import { applySubmit } from '@/service/message';
import { formatApiError } from '@/utils/formatApiError';

const title = ref('');
const content = ref('');
const linkUrl = ref('');
const submitting = ref(false);
const message = ref('');
const error = ref('');

async function submit() {
  submitting.value = true;
  message.value = '';
  error.value = '';
  try {
    if (!title.value.trim() || !content.value.trim()) {
      error.value = '请填写标题和内容';
      return;
    }
    await applySubmit({
      title: title.value.trim(),
      content: content.value.trim(),
      linkUrl: linkUrl.value.trim(),
      sendMessageType: '站内信',
    });
    title.value = '';
    content.value = '';
    linkUrl.value = '';
    message.value = '申请已提交，等待管理员审批';
  } catch (e) {
    error.value = formatApiError(e, '提交失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="apply-panel card">
    <h3>提交群发申请</h3>
    <p class="hint">非管理员通过 apply-submit 提交，审批通过后才会投递。</p>
    <input v-model="title" placeholder="消息标题" />
    <textarea v-model="content" placeholder="消息内容" rows="3" />
    <input v-model="linkUrl" placeholder="跳转链接，如 /leader 或 https://..." />
    <button type="button" :disabled="submitting" @click="submit">提交申请</button>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="message" class="ok">{{ message }}</p>
  </div>
</template>

<style scoped>
.apply-panel h3 {
  margin: 0 0 0.35rem;
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
}
input, textarea {
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-sizing: border-box;
}
button {
  padding: 0.4rem 0.75rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
.err {
  margin: 0.5rem 0 0;
  color: #dc2626;
  font-size: 0.8125rem;
}
.ok {
  margin: 0.5rem 0 0;
  color: #16a34a;
  font-size: 0.8125rem;
}
</style>
