<script setup lang="ts">
import { useCopyPaste } from '../composables/useCopyPaste'

const { copied, cancel } = useCopyPaste()
</script>

<template>
  <div v-if="copied" class="copy-banner">
    <span>
      Track {{ copied.sourceSlotIndex }}
      ({{ copied.sourceTableKind }})
      copied from {{ copied.sourceSide }} pane
      — click an empty slot on the other pane to paste
    </span>
    <button class="btn-cancel" @click="cancel">Cancel</button>
  </div>
</template>

<style scoped>
.copy-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 13px;
}
.btn-cancel {
  padding: 2px 10px;
  border: 1px solid #aaa;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}
.btn-cancel:hover {
  background: #f0f0f0;
}
</style>
