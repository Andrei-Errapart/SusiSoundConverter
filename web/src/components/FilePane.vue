<script setup lang="ts">
import type { PaneSide } from '../composables/useCopyPaste'
import { useSoundFile } from '../composables/useSoundFile'
import { useCopyPaste } from '../composables/useCopyPaste'
import { importWav, importAudioFile } from '../lib/wav-import'
import { fetchSoundUrl } from '../lib/url-fetch'
import { ParseError } from '../lib/parser'
import FileToolbar from './FileToolbar.vue'
import FlashUsageBar from './FlashUsageBar.vue'
import TrackTable from './TrackTable.vue'

const props = defineProps<{
  side: PaneSide
}>()

const { file, error, loading, flashUsed, flashTotal, loadData, loadFile, exportFile } = useSoundFile()
const { selected, clearSelection } = useCopyPaste()

function handleLoad(inputFile: File) {
  loadFile(inputFile)
}

function isUrl(text: string): boolean {
  try {
    const u = new URL(text.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function extractUrlFromHtml(html: string): string | null {
  const match = html.match(/href=["']([^"']+)["']/)
  return match ? match[1] : null
}

async function fetchAndLoad(url: string): Promise<void> {
  const { data, filename } = await fetchSoundUrl(url)
  loadData(data, filename)
}

async function readClipboardText(): Promise<string | null> {
  // navigator.clipboard may be undefined (Safari on non-secure contexts)
  if (typeof navigator.clipboard?.readText === 'function') {
    try {
      return await navigator.clipboard.readText()
    } catch {
      // Permission denied or not supported — fall through to prompt
    }
  }
  // Fallback: ask the user to paste the URL manually
  const input = window.prompt('Paste a download URL:')
  return input
}

async function readClipboardItems(): Promise<ClipboardItems | null> {
  if (typeof navigator.clipboard?.read === 'function') {
    try {
      return await navigator.clipboard.read()
    } catch {
      return null
    }
  }
  return null
}

async function handlePaste(): Promise<void> {
  error.value = null
  loading.value = true
  try {
    // Try reading text first (most common: URL)
    const text = await readClipboardText()
    if (text && isUrl(text.trim())) {
      await fetchAndLoad(text.trim())
      return
    }

    // Try reading clipboard items for HTML with links or binary files
    const items = await readClipboardItems()
    if (items) {
      for (const item of items) {
        // Check for HTML with embedded link
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html')
          const html = await blob.text()
          const url = extractUrlFromHtml(html)
          if (url && isUrl(url)) {
            await fetchAndLoad(url)
            return
          }
        }

        // Check for binary file data
        for (const type of item.types) {
          if (type.startsWith('application/') || type.startsWith('image/') || type === 'application/octet-stream') {
            const blob = await item.getType(type)
            const buffer = await blob.arrayBuffer()
            const data = new Uint8Array(buffer)
            const ext = guessExtension(data)
            loadData(data, `clipboard${ext}`)
            return
          }
        }
      }
    }

    // If we got plain text but it wasn't a URL
    if (text) {
      error.value = 'Clipboard text is not a URL. Copy a download link or file, then try again.'
    } else if (text === null) {
      // User cancelled the prompt or clipboard was inaccessible
      error.value = null
    } else {
      error.value = 'Clipboard is empty. Copy a download link or file, then try again.'
    }
  } catch (e) {
    if (e instanceof ParseError) {
      error.value = e.message
    } else if (e instanceof Error) {
      error.value = e.message
    } else {
      error.value = `Paste failed: ${e}`
    }
  } finally {
    loading.value = false
  }
}

function guessExtension(data: Uint8Array): string {
  // ZIP magic: PK\x03\x04
  if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4B && data[2] === 0x03 && data[3] === 0x04) {
    return '.zip'
  }
  return '.ds3'
}

async function handlePasteFile(pastedFile: File): Promise<void> {
  await loadFile(pastedFile)
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

defineExpose({ file, handlePasteFile })
</script>

<template>
  <div class="file-pane">
    <FileToolbar
      :file="file"
      :error="error"
      :loading="loading"
      @load="handleLoad"
      @paste="handlePaste"
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
