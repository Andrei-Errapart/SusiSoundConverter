import { ref } from 'vue'
import type { Track, TrackTableKind } from '../types/sound-file'

export type PaneSide = 'left' | 'right'

export interface CopiedTrack {
  track: Track
  sourceSide: PaneSide
  sourceTableKind: TrackTableKind
  sourceSlotIndex: number
}

const copied = ref<CopiedTrack | null>(null)

export function useCopyPaste() {
  function copyTrack(track: Track, side: PaneSide): void {
    // If clicking the same track again, cancel
    if (
      copied.value &&
      copied.value.sourceSide === side &&
      copied.value.sourceTableKind === track.table &&
      copied.value.sourceSlotIndex === track.index
    ) {
      cancel()
      return
    }

    copied.value = {
      track,
      sourceSide: side,
      sourceTableKind: track.table,
      sourceSlotIndex: track.index,
    }
  }

  function pasteTrack(
    targetSlots: (Track | null)[],
    targetIndex: number,
    targetTableKind: TrackTableKind,
    targetSide: PaneSide
  ): boolean {
    if (!copied.value) return false
    if (copied.value.sourceSide === targetSide) return false

    // Deep-copy the audio
    const source = copied.value.track
    const newTrack: Track = {
      index: targetIndex,
      table: targetTableKind,
      audio: new Uint8Array(source.audio),
      loopOffset: source.loopOffset,
    }

    targetSlots[targetIndex] = newTrack
    copied.value = null
    return true
  }

  function cancel(): void {
    copied.value = null
  }

  function isCopied(side: PaneSide, tableKind: TrackTableKind, slotIndex: number): boolean {
    if (!copied.value) return false
    return (
      copied.value.sourceSide === side &&
      copied.value.sourceTableKind === tableKind &&
      copied.value.sourceSlotIndex === slotIndex
    )
  }

  function canPaste(side: PaneSide): boolean {
    return copied.value !== null && copied.value.sourceSide !== side
  }

  return {
    copied,
    copyTrack,
    pasteTrack,
    cancel,
    isCopied,
    canPaste,
  }
}
