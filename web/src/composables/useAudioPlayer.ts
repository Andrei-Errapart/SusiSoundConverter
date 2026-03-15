import { ref } from 'vue'
import { playTrack, stopPlayback } from '../lib/audio'
import type { TrackTableKind } from '../types/sound-file'

const isPlaying = ref(false)
const currentTrackKey = ref<string | null>(null)

export function useAudioPlayer() {
  function play(
    audio: Uint8Array,
    side: string,
    tableKind: TrackTableKind,
    index: number,
    sampleRate: number,
    bitDepth: number,
  ): void {
    const key = `${side}:${tableKind}:${index}`

    // If clicking the same track, stop it
    if (isPlaying.value && currentTrackKey.value === key) {
      stop()
      return
    }

    isPlaying.value = true
    currentTrackKey.value = key

    playTrack(audio, sampleRate, bitDepth, () => {
      if (currentTrackKey.value === key) {
        isPlaying.value = false
        currentTrackKey.value = null
      }
    })
  }

  function stop(): void {
    stopPlayback()
    isPlaying.value = false
    currentTrackKey.value = null
  }

  function isTrackPlaying(side: string, tableKind: TrackTableKind, index: number): boolean {
    return isPlaying.value && currentTrackKey.value === `${side}:${tableKind}:${index}`
  }

  return {
    isPlaying,
    currentTrackKey,
    play,
    stop,
    isTrackPlaying,
  }
}
