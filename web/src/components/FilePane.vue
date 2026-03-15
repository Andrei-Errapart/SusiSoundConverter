<script setup lang="ts">
import type { PaneSide } from '../composables/useCopyPaste'
import { useSoundFile } from '../composables/useSoundFile'
import { useCopyPaste } from '../composables/useCopyPaste'
import { importWav, importAudioFile } from '../lib/wav-import'
import FileToolbar from './FileToolbar.vue'
import FlashUsageBar from './FlashUsageBar.vue'
import TrackTable from './TrackTable.vue'

const props = defineProps<{
  side: PaneSide
}>()

const { file, error, flashUsed, flashTotal, loadFile, exportFile } = useSoundFile()
const { selected, clearSelection } = useCopyPaste()

function handleLoad(inputFile: File) {
  loadFile(inputFile)
}

function handleOverwrite(tableKind: string, targetIndex: number) {
  if (!file.value || !selected.value) return

  const table = file.value.tables.find(t => t.kind === tableKind)
  if (!table) return

  const source = selected.value.track
  const newTrack = {
    index: targetIndex,
    table: table.kind,
    audio: new Uint8Array(source.audio),
    loopOffset: source.loopOffset,
  }

  table.slots[targetIndex] = newTrack
  file.value.dirty = true
  clearSelection()
}

async function handleImportWav(tableKind: string, targetIndex: number, wavFile: File) {
  if (!file.value) return

  const table = file.value.tables.find(t => t.kind === tableKind)
  if (!table) return

  try {
    const buffer = await wavFile.arrayBuffer()
    const isWav = wavFile.name.toLowerCase().endsWith('.wav')
    const audio = isWav ? importWav(buffer) : await importAudioFile(buffer)

    table.slots[targetIndex] = {
      index: targetIndex,
      table: table.kind,
      audio,
      loopOffset: 0,
    }
    file.value.dirty = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to import WAV file'
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
        @overwrite="handleOverwrite"
        @import-wav="handleImportWav"
      />
    </template>
    <div v-else class="empty-pane">
      <p>Load a sound file (.DSD, .DS3, .DX4, .DSU, .DS6, .ZIP)</p>
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
