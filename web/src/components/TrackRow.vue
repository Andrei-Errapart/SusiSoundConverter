<script setup lang="ts">
import type { Track, TrackTableKind } from '../types/sound-file'
import { formatDuration } from '../lib/track-utils'
import { crc32hex } from '../lib/crc32'
import { useAudioPlayer } from '../composables/useAudioPlayer'
import { useCopyPaste, type PaneSide } from '../composables/useCopyPaste'

const props = defineProps<{
  track: Track | null
  index: number
  tableKind: TrackTableKind
  isPaired: boolean
  side: PaneSide
}>()

const emit = defineEmits<{
  paste: [index: number]
}>()

const { play, isTrackPlaying } = useAudioPlayer()
const { copyTrack, canPaste, isCopied } = useCopyPaste()

function handleClick() {
  if (!props.track) {
    if (canPaste(props.side)) {
      emit('paste', props.index)
    }
    return
  }
  copyTrack(props.track, props.side)
}

function handlePlay(e: Event) {
  e.stopPropagation()
  if (props.track && props.track.audio.length > 0) {
    play(props.track.audio, props.side, props.tableKind, props.index)
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
      'track-copied': isCopied(side, tableKind, index),
      'track-paste-target': !track && canPaste(side),
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
        {{ formatDuration(track.audio.length) }}
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
        v-if="track && track.audio.length > 0"
        class="btn-play"
        :class="{ playing: isTrackPlaying(side, tableKind, index) }"
        @click="handlePlay"
        :title="isTrackPlaying(side, tableKind, index) ? 'Stop' : 'Play'"
      >
        {{ isTrackPlaying(side, tableKind, index) ? '\u25A0' : '\u25B6' }}
      </button>
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
}
.track-copied {
  background: #c8f7c5 !important;
}
.track-paste-target:hover {
  background: #c5daf7 !important;
  cursor: cell;
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
  width: 36px;
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
.btn-play:hover {
  background: #e0e0e0;
}
.btn-play.playing {
  color: #d63031;
}
</style>
