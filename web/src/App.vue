<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import FilePane from './components/FilePane.vue'
import { useCopyPaste } from './composables/useCopyPaste'

const { clearSelection } = useCopyPaste()

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') clearSelection()
}

onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>IntelliSound Web Editor</h1>
    </header>
    <div class="panes">
      <FilePane side="left" />
      <FilePane side="right" />
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
}
.app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 12px 16px;
}
.app-header {
  margin-bottom: 12px;
}
.app-header h1 {
  font-size: 20px;
  font-weight: 600;
}
.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
</style>
