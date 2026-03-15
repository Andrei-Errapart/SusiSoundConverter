<script setup lang="ts">
import type { Track, TrackTableKind } from '../types/sound-file'
import { formatDuration } from '../lib/track-utils'
import { crc32hex } from '../lib/crc32'
import { useAudioPlayer } from '../composables/useAudioPlayer'
import { useCopyPaste, type PaneSide } from '../composables/useCopyPaste'
import { ref } from 'vue'

const props = defineProps<{
  track: Track | null
  index: number
  tableKind: TrackTableKind
  isPaired: boolean
  side: PaneSide
  sampleRate: number
  bitDepth: number
}>()

const emit = defineEmits<{
  overwrite: [index: number]
  'import-wav': [index: number, file: File]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const { play, isTrackPlaying } = useAudioPlayer()
const { selected, selectTrack, isSelected, hasSelection } = useCopyPaste()

function handleClick() {
  if (!props.track || props.track.audio.length === 0) return
  selectTrack(props.track, props.side, props.tableKind, props.index, props.sampleRate, props.bitDepth)
}

function handlePlay(e: Event) {
  e.stopPropagation()
  if (props.track && props.track.audio.length > 0) {
    play(props.track.audio, props.side, props.tableKind, props.index, props.sampleRate, props.bitDepth)
  }
}

function canOverwrite(): boolean {
  if (!hasSelection.value) return false
  if (!props.track) return false
  if (isSelected(props.side, props.tableKind, props.index)) return false
  if (!selected.value || selected.value.track.audio.length === 0) return false
  return true
}

function handleOverwrite(e: Event) {
  e.stopPropagation()
  emit('overwrite', props.index)
}

function handleImportClick(e: Event) {
  e.stopPropagation()
  fileInput.value?.click()
}

function handleFileSelected() {
  const file = fileInput.value?.files?.[0]
  if (file) {
    emit('import-wav', props.index, file)
    fileInput.value!.value = ''
  }
}

function displayIndex(): string {
  if (props.isPaired) {
    return String(Math.floor(props.index / 2))
  }
  return String(props.index)
}
</script>

<template>
  <tr
    :class="{
      'track-row': true,
      'track-empty': !track,
      'track-selected': isSelected(side, tableKind, index),
      'track-playing': track && isTrackPlaying(side, tableKind, index),
    }"
    @click="handleClick"
  >
    <td class="col-index">{{ displayIndex() }}</td>
    <td class="col-size">
      <template v-if="track && track.audio.length > 0">
        {{ track.audio.length.toLocaleString() }}
      </template>
      <template v-else-if="track">0</template>
      <template v-else>&mdash;</template>
    </td>
    <td class="col-duration">
      <template v-if="track && track.audio.length > 0">
        {{ formatDuration(track.audio.length, sampleRate, bitDepth === 16 ? 2 : 1) }}
      </template>
      <template v-else>&mdash;</template>
    </td>
    <td v-if="isPaired" class="col-loop">
      <template v-if="track && track.loopOffset > 0">
        {{ track.loopOffset.toLocaleString() }}
      </template>
      <template v-else>&mdash;</template>
    </td>
    <td class="col-crc">
      <template v-if="track && track.audio.length > 0">
        {{ crc32hex(track.audio) }}
      </template>
      <template v-else>&mdash;</template>
    </td>
    <td class="col-actions">
      <button
        class="btn-play"
        :class="{ playing: track && isTrackPlaying(side, tableKind, index) }"
        :disabled="!track || track.audio.length === 0"
        @click="handlePlay"
        :title="track && isTrackPlaying(side, tableKind, index) ? 'Stop' : 'Play'"
      >
        {{ track && isTrackPlaying(side, tableKind, index) ? '\u25A0' : '\u25B6' }}
      </button>
      <button
        class="btn-overwrite"
        :disabled="!canOverwrite()"
        @click="handleOverwrite"
        title="Overwrite with selected track"
      >
        &larr;
      </button>
      <button
        class="btn-import"
        :disabled="!track"
        @click="handleImportClick"
        title="Import audio file (WAV, MP3)"
      >
        &#x1F4C2;
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".wav,.mp3"
        style="display: none"
        @change="handleFileSelected"
      >
    </td>
  </tr>
</template>

<style scoped>
.track-row {
  cursor: pointer;
  transition: background 0.15s;
}
.track-row:hover {
  background: #f0f0f0;
}
.track-empty {
  color: #999;
  cursor: default;
}
.track-selected {
  background: #c8f7c5 !important;
}
.track-playing {
  background: #fff3cd !important;
}
td {
  padding: 2px 8px;
  font-size: 13px;
  white-space: nowrap;
}
.col-index {
  text-align: right;
  font-weight: 600;
  width: 50px;
}
.col-size {
  text-align: right;
  width: 80px;
}
.col-duration {
  text-align: right;
  width: 70px;
}
.col-loop {
  text-align: right;
  width: 70px;
}
.col-crc {
  text-align: right;
  width: 80px;
  font-family: monospace;
  font-size: 11px;
  color: #666;
}
.col-actions {
  width: 60px;
  text-align: center;
}
.btn-play {
  background: none;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  padding: 1px 6px;
  line-height: 1.2;
}
.btn-play:hover:not(:disabled) {
  background: #e0e0e0;
}
.btn-play:disabled {
  opacity: 0.3;
  cursor: default;
}
.btn-play.playing {
  color: #d63031;
}
.btn-overwrite {
  background: none;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  padding: 1px 6px;
  line-height: 1.2;
  margin-left: 2px;
}
.btn-overwrite:hover:not(:disabled) {
  background: #e0e0e0;
}
.btn-overwrite:disabled {
  opacity: 0.3;
  cursor: default;
}
.btn-import {
  background: none;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  padding: 1px 6px;
  line-height: 1.2;
  margin-left: 2px;
}
.btn-import:hover:not(:disabled) {
  background: #e0e0e0;
}
.btn-import:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
