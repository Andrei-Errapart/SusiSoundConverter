<script setup lang="ts">
import type { PaneSide } from '../composables/useCopyPaste'
import { useSoundFile } from '../composables/useSoundFile'
import { useCopyPaste } from '../composables/useCopyPaste'
import FileToolbar from './FileToolbar.vue'
import FlashUsageBar from './FlashUsageBar.vue'
import TrackTable from './TrackTable.vue'

const props = defineProps<{
  side: PaneSide
}>()

const { file, error, flashUsed, flashTotal, loadFile, exportFile } = useSoundFile()
const { pasteTrack } = useCopyPaste()

function handleLoad(inputFile: File) {
  loadFile(inputFile)
}

function handlePaste(tableKind: string, index: number) {
  if (!file.value) return

  const table = file.value.tables.find(t => t.kind === tableKind)
  if (!table) return

  if (pasteTrack(table.slots, index, table.kind, props.side)) {
    file.value.dirty = true
  }
}

defineExpose({ file })
</script>

<template>
  <div class="file-pane">
    <FileToolbar
      :file="file"
      :error="error"
      @load="handleLoad"
      @export="exportFile"
    />
    <template v-if="file">
      <FlashUsageBar :used="flashUsed" :total="flashTotal" />
      <TrackTable
        v-for="table in file.tables"
        :key="table.kind"
        :table="table"
        :side="side"
        @paste="handlePaste"
      />
    </template>
    <div v-else class="empty-pane">
      <p>Load a sound file (.DS3, .DX4, .DSU, .DS6)</p>
    </div>
  </div>
</template>

<style scoped>
.file-pane {
  min-width: 0;
  overflow-y: auto;
}
.empty-pane {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #999;
  border: 2px dashed #ddd;
  border-radius: 8px;
  margin-top: 8px;
}
</style>
