import { ref, computed } from 'vue'
import type { Track, TrackTableKind } from '../types/sound-file'

export type PaneSide = 'left' | 'right'

export interface SelectedTrack {
  track: Track
  side: PaneSide
  tableKind: TrackTableKind
  slotIndex: number
}

const selected = ref<SelectedTrack | null>(null)

export function useCopyPaste() {
  function selectTrack(track: Track, side: PaneSide, tableKind: TrackTableKind, slotIndex: number): void {
    // Toggle off if clicking the same track
    if (
      selected.value &&
      selected.value.side === side &&
      selected.value.tableKind === tableKind &&
      selected.value.slotIndex === slotIndex
    ) {
      selected.value = null
      return
    }

    selected.value = { track, side, tableKind, slotIndex }
  }

  function clearSelection(): void {
    selected.value = null
  }

  function isSelected(side: PaneSide, tableKind: TrackTableKind, slotIndex: number): boolean {
    if (!selected.value) return false
    return (
      selected.value.side === side &&
      selected.value.tableKind === tableKind &&
      selected.value.slotIndex === slotIndex
    )
  }

  const hasSelection = computed(() => selected.value !== null)

  return {
    selected,
    selectTrack,
    clearSelection,
    isSelected,
    hasSelection,
  }
}
