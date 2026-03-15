<script setup lang="ts">
import { ref } from 'vue'
import type { SoundFile } from '../types/sound-file'

const props = defineProps<{
  file: SoundFile | null
  error: string | null
  loading: boolean
}>()

const emit = defineEmits<{
  load: [file: File]
  paste: []
  export: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files[0]) {
    emit('load', input.files[0])
    input.value = '' // reset so the same file can be re-loaded
  }
}
</script>

<template>
  <div class="toolbar">
    <input
      ref="fileInput"
      type="file"
      accept=".ds3,.DS3,.ds4,.DS4,.dsu,.DSU,.dx4,.DX4,.ds6,.DS6,.dsd,.DSD,.dhe,.DHE,.zip,.ZIP"
      style="display:none"
      @change="onFileSelected"
    />
    <button class="btn" @click="openFilePicker">Load File</button>
    <button
      class="btn"
      :disabled="loading"
      @click="$emit('paste')"
    >
      {{ loading ? 'Loading\u2026' : 'Load from Clipboard (URL)' }}
    </button>
    <button
      class="btn"
      :disabled="!file"
      @click="$emit('export')"
    >
      Export
    </button>
    <span v-if="file" class="file-info">
      <strong>{{ file.filename }}</strong>
      <span class="format-badge">{{ file.format }}</span>
      <span v-if="file.dirty" class="dirty-badge">modified</span>
      <span v-if="file.soundName" class="sound-name">"{{ file.soundName }}"</span>
    </span>
    <span v-if="error" class="error-msg">{{ error }}</span>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #f8f9fa;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 8px;
}
.btn {
  padding: 4px 12px;
  border: 1px solid #aaa;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover:not(:disabled) {
  background: #e9ecef;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.file-info {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.format-badge {
  background: #4dabf7;
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}
.dirty-badge {
  background: #ffa94d;
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.sound-name {
  color: #666;
  font-style: italic;
  font-size: 12px;
}
.error-msg {
  color: #d63031;
  font-size: 12px;
}
</style>
