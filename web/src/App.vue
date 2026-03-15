<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import FilePane from './components/FilePane.vue'
import { useCopyPaste } from './composables/useCopyPaste'

const { clearSelection } = useCopyPaste()

const leftPane = ref<InstanceType<typeof FilePane> | null>(null)
const rightPane = ref<InstanceType<typeof FilePane> | null>(null)
const lastFocusedSide = ref<'left' | 'right'>('left')

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') clearSelection()
}

function onPaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files
  if (files && files.length > 0) {
    e.preventDefault()
    const pane = lastFocusedSide.value === 'right' ? rightPane.value : leftPane.value
    pane?.handlePasteFile(files[0])
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('paste', onPaste)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('paste', onPaste)
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>IntelliSound Web Editor</h1>
    </header>
    <div class="panes">
      <div @click="lastFocusedSide = 'left'" @focusin="lastFocusedSide = 'left'">
        <FilePane ref="leftPane" side="left" />
      </div>
      <div @click="lastFocusedSide = 'right'" @focusin="lastFocusedSide = 'right'">
        <FilePane ref="rightPane" side="right" />
      </div>
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
