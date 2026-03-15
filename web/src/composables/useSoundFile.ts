import { ref, computed } from 'vue'
import type { SoundFile } from '../types/sound-file'
import { parseFile, ParseError } from '../lib/parser'
import { serializeFile, downloadFile } from '../lib/serializer'
import { computeTotalAudioSize } from '../lib/track-utils'
import { extractSoundFromZip } from '../lib/zip-extract'

export function useSoundFile() {
  const file = ref<SoundFile | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)

  const totalAudioBytes = computed(() => {
    if (!file.value) return 0
    return computeTotalAudioSize(file.value.tables)
  })

  const flashUsed = computed(() => {
    if (!file.value) return 0
    const headerSize = file.value.format === 'DHE' ? 0x2000
      : file.value.format === 'DS6' ? 0x627 : 0x300
    return headerSize + totalAudioBytes.value
  })

  const flashTotal = computed(() => file.value?.flashSize ?? 0)

  function loadData(data: Uint8Array, filename: string): void {
    // If it's a ZIP, try to extract a sound file from it
    const extracted = extractSoundFromZip(data, filename)
    if (extracted) {
      data = extracted.data
      filename = extracted.filename
    }

    file.value = parseFile(data, filename)
  }

  async function loadFile(inputFile: File): Promise<void> {
    error.value = null
    loading.value = true
    try {
      const buffer = await inputFile.arrayBuffer()
      loadData(new Uint8Array(buffer), inputFile.name)
    } catch (e) {
      if (e instanceof ParseError) {
        error.value = e.message
      } else {
        error.value = `Failed to load file: ${e}`
      }
      file.value = null
    } finally {
      loading.value = false
    }
  }

  function exportFile(): void {
    if (!file.value) return
    try {
      const data = serializeFile(file.value)
      if (data.length > file.value.flashSize) {
        error.value = `Export size (${data.length}) exceeds flash capacity (${file.value.flashSize})`
        return
      }
      downloadFile(data, file.value.filename)
      file.value.dirty = false
    } catch (e) {
      error.value = `Export failed: ${e}`
    }
  }

  return {
    file,
    error,
    loading,
    totalAudioBytes,
    flashUsed,
    flashTotal,
    loadData,
    loadFile,
    exportFile,
  }
}
